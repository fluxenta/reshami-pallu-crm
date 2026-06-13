import fs from "fs";
import path from "path";
import sharp from "sharp";

// 1. Manually load environment variables from .env.local to ensure database and Shopify settings work
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  for (const line of envConfig.split("\n")) {
    const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (matched) {
      const key = matched[1];
      let value = matched[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

// Imports will be loaded dynamically after env variables are parsed to avoid ES hoisting order issues.

// Helper to parse CSV robustly
function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let entry = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        entry += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        entry += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(entry.trim());
        entry = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        row.push(entry.trim());
        result.push(row);
        row = [];
        entry = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        entry += char;
      }
    }
  }
  if (entry || row.length > 0) {
    row.push(entry.trim());
    result.push(row);
  }
  return result;
}

interface UploadReportItem {
  serialNumber: string;
  sku: string;
  title: string;
  price: number;
  costPrice: number;
  stock: number;
  fabric: string;
  weave: string;
  colors: string;
  imagesCount: number;
  images: string[];
  status: "success" | "failed";
  shopifyId?: string;
  error?: string;
  timestamp: string;
}

async function runBulkUpload() {
  const { shopifySaree } = await import("../src/lib/shopify");
  const { sareeDb } = await import("../src/lib/db");
  console.log("🚀 Starting programatic bulk Saree and local Media upload...");
  
  const csvPath = path.resolve(process.cwd(), "data/inventory_cleaned.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Cleaned CSV not found at: ${csvPath}. Run clean-csv first!`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const allRows = parseCSV(csvContent);
  const headers = allRows[0];
  const dataRows = allRows.slice(2); // Skip description/instructions row at index 1

  console.log(`Parsed ${dataRows.length} catalog items from cleaned CSV.`);

  const report: UploadReportItem[] = [];

  // Helper to normalize keys (e.g., "Colors (comma seperated)" -> "colors")
  const normalizeKey = (key: string) => {
    return key.replace(/\([^)]*\)/g, '').trim().toLowerCase().replace(/[\s_-]/g, '');
  };

  for (const row of dataRows) {
    const item: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const normKey = normalizeKey(h);
      item[normKey] = row[idx] || '';
    });

    const serialNum = item['serialnumber'];
    const sku = item['sku'];
    let title = item['title'];

    // Fallback for Serial Number 28 where Title is empty
    if (serialNum === '28' && !title) {
      title = 'Lavender Starlight Saree';
    }

    if (!serialNum || !title) continue;

    console.log(`\n⏳ [Item ${serialNum}] Processing Saree SKU: ${sku} - "${title}"...`);

    const reportItem: UploadReportItem = {
      serialNumber: serialNum,
      sku,
      title,
      price: parseFloat(item['price']) || 0,
      costPrice: parseFloat(item['costprice']) || 0,
      stock: parseInt(item['stock']) || 0,
      fabric: item['fabric'],
      weave: item['weave'] || item['weaveoptional'],
      colors: item['colors'] || item['colorscommaseperated'],
      imagesCount: 0,
      images: [],
      status: "failed",
      timestamp: new Date().toISOString()
    };

    try {
      // Check if product with SKU already exists on Shopify
      let existingProductId: string | null = null;
      let existingImagesCount = 0;
      
      const { shopifyAdminFetch } = await import("../src/lib/shopify");
      const checkRes = await shopifyAdminFetch<any>({
        query: `
          query getProductBySku($query: String!) {
            products(first: 1, query: $query) {
              edges {
                node {
                  id
                  media(first: 10) {
                    edges {
                      node {
                        ... on MediaImage {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { query: `sku:${sku}` }
      });

      const edges = checkRes.products?.edges || [];
      if (edges.length > 0) {
        existingProductId = edges[0].node.id;
        existingImagesCount = edges[0].node.media?.edges?.length || 0;
        
        // If it exists and already has images, skip processing to avoid duplication
        if (existingImagesCount > 0) {
          console.log(`  ✓ Saree SKU ${sku} already exists on Shopify with ${existingImagesCount} images. Skipping.`);
          reportItem.status = "success";
          reportItem.shopifyId = existingProductId!;
          reportItem.imagesCount = existingImagesCount;
          report.push(reportItem);
          continue;
        }
        console.log(`  ⚠️ Saree SKU ${sku} exists but has 0 images. Proceeding to upload images...`);
      }

      // 1. Discover local images matching Serial Number
      const itemMediaDir = path.resolve(process.cwd(), `data/inventory/${serialNum}`);
      const uploadedImages: Array<{ id: string; url: string }> = [];

      if (fs.existsSync(itemMediaDir)) {
        const files = fs.readdirSync(itemMediaDir);
        // Only keep standard image files (ignore video shoots like .mp4, .mov)
        const imageFiles = files.filter(file => {
          const ext = path.extname(file).toLowerCase();
          return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext);
        });

        // Prioritize model photos (model1, model2, ...) first, then other pictures
        imageFiles.sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aModel = aLower.match(/model(\d+)/);
          const bModel = bLower.match(/model(\d+)/);
          
          if (aModel && bModel) {
            return parseInt(aModel[1], 10) - parseInt(bModel[1], 10);
          } else if (aModel) {
            return -1;
          } else if (bModel) {
            return 1;
          }
          return aLower.localeCompare(bLower);
        });

        console.log(`  Found ${imageFiles.length} images for serial number ${serialNum}`);

        const heicConvert = require("heic-convert");

        for (const file of imageFiles) {
          const absoluteRawPath = path.join(itemMediaDir, file);
          let fileBuffer = fs.readFileSync(absoluteRawPath);
          const ext = path.extname(file).toLowerCase();

          // Convert HEIC to JPEG buffer
          if (ext === ".heic" || ext === ".heif") {
            try {
              console.log(`  Converting HEIC image: ${file} to JPEG...`);
              const converted = await heicConvert({
                buffer: fileBuffer,
                format: "JPEG",
                quality: 0.9
              });
              fileBuffer = Buffer.from(converted);
            } catch (convErr: any) {
              console.error(`  ⚠️ HEIC conversion failed for ${file}:`, convErr.message);
            }
          }

          console.log(`  Optimizing image: ${file}...`);
          // Optimize image to max 2400px wide, quality 88
          const optimizedBuffer = await sharp(fileBuffer)
            .resize(2400, undefined, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 88, progressive: true })
            .toBuffer();

          const mimeType = "image/jpeg";
          const uploadName = `${sku}_${path.basename(file, path.extname(file)).replace(/\.(heic|heif)$/i, "")}.jpg`;

          // Retry media upload up to 3 times in case of temporary network glitches
          let uploadResult = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log(`  Uploading optimized image: ${uploadName} to Shopify (Attempt ${attempt})...`);
              uploadResult = await shopifySaree.uploadMedia(uploadName, mimeType, optimizedBuffer);
              console.log(`  ✓ Image uploaded successfully. ID: ${uploadResult.id}`);
              break;
            } catch (uploadErr: any) {
              if (attempt === 3) throw uploadErr;
              console.warn(`  ⚠️ Upload attempt ${attempt} failed for ${uploadName}, retrying in 2 seconds...`, uploadErr.message);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          if (uploadResult) {
            uploadedImages.push({
              id: uploadResult.id,
              url: uploadResult.url
            });
            reportItem.images.push(uploadResult.url);
          }
        }
      } else {
        console.warn(`  ⚠️ Media directory not found: ${itemMediaDir}`);
      }

      reportItem.imagesCount = uploadedImages.length;

      // Text Casing and Clean Helpers
      const toTitleCase = (str: string) => {
        if (!str) return "";
        return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      };

      const cleanFieldList = (val: string) => {
        if (!val || val.toLowerCase() === 'nil') return '';
        const items = val.split(/[,;\/&]|\band\b/i)
          .map(item => item.trim())
          .filter(item => item && item.toLowerCase() !== 'nil')
          .map(item => toTitleCase(item));
        return Array.from(new Set(items)).join(', ');
      };

      const cleanTitle = toTitleCase(title);
      const cleanFabric = cleanFieldList(item['fabric']);
      const cleanWeave = cleanFieldList(item['weave'] || item['weaveoptional']);
      const cleanColors = cleanFieldList(item['colors'] || item['colorscommaseperated']);
      const cleanOccasion = cleanFieldList(item['occasion'] || item['occasioncommaseperated']);
      const cleanWashCare = cleanFieldList(item['washcare'] || 'Dry Wash Only');

      // 2. Prepare product creation/update payload
      const tagsField = item['tags'] || item['tagscommaseperated'] || '';
      const tags = tagsField ? tagsField.split(',').map(t => t.trim()).filter(Boolean) : [];
      
      const payload = {
        title: cleanTitle,
        descriptionHtml: `<p>${(item['description'] || item['descriptionoptional'] || '').replace(/\n/g, "<br />")}</p>`,
        status: (item['status'] || 'ACTIVE').toUpperCase() as any,
        price: reportItem.price,
        compareAtPrice: parseFloat(item['compareatprice']) || null,
        stock: reportItem.stock,
        sku,
        tags,
        images: uploadedImages,
        metafields: {
          fabric: cleanFabric,
          weave: cleanWeave,
          colorFamily: cleanColors,
          occasion: cleanOccasion,
          region: toTitleCase(item['region'] || item['regionoptional'] || 'Banaras'),
          blouseIncluded: item['blouseincluded']?.toUpperCase() === 'TRUE',
          blouseLength: item['blouselength'] || item['blouselengthoptional'] || '80cm',
          sareeLength: parseFloat(item['sareelength'] || '6.0').toFixed(1) + " meters",
          washCare: cleanWashCare,
          foundersExclusive: item['foundersexclusive']?.toUpperCase() === 'TRUE'
        },
        privateNotes: item['privatenotes'] || ''
      };

      let shopifyId = "";
      if (existingProductId) {
        console.log(`  Updating existing Saree listing on Shopify to attach new images...`);
        const updatedProduct = await shopifySaree.update(existingProductId, { images: uploadedImages } as any);
        shopifyId = updatedProduct.id;
        console.log(`  ✓ Product images updated in Shopify. ID: ${shopifyId}`);
      } else {
        console.log(`  Creating Saree listing on Shopify...`);
        const createdProduct = await shopifySaree.create(payload);
        shopifyId = createdProduct.id;
        console.log(`  ✓ Product created successfully in Shopify. ID: ${shopifyId}`);
      }

      // 3. Save Weaver Cost & Margin to Upstash Redis
      const margin = reportItem.price > 0 ? (reportItem.price - reportItem.costPrice) / reportItem.price : 0;
      await sareeDb.set(sku, {
        costPrice: reportItem.costPrice,
        margin,
        privateNotes: item['privatenotes'] || ''
      });
      console.log(`  ✓ Saved private cost metrics to Upstash Redis`);

      reportItem.status = "success";
      reportItem.shopifyId = shopifyId;
    } catch (err: any) {
      console.error(`  ❌ Failed to upload item ${serialNum}:`, err.message || err);
      reportItem.status = "failed";
      reportItem.error = err.message || String(err);
    }

    report.push(reportItem);
  }

  // 4. Save report in public directory for the CRM dashboard to display
  const reportPath = path.resolve(process.cwd(), "public/bulk-upload-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n🎉 Bulk upload process finished! Report saved to: ${reportPath}`);
}

runBulkUpload().catch(console.error);
