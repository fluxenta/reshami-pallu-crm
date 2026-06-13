import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { shopifySaree } from "@/lib/shopify";
import { sareeDb } from "@/lib/db";

// Authentication Helper
async function verifySession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("crm_session");
  return session && session.value === "authenticated";
}

// CSV Parser Helper
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

export async function POST(req: NextRequest) {
  try {
    if (!await verifySession()) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    console.log("[Bulk Upload API] Starting local batch upload process...");
    const csvPath = path.resolve(process.cwd(), "data/inventory_cleaned.csv");
    
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: "Cleaned CSV file not found. Please clean the CSV first." }, { status: 400 });
    }

    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const allRows = parseCSV(csvContent);
    const headers = allRows[0];
    const dataRows = allRows.slice(2); // Skip header and instructions

    // Helper to normalize keys (e.g., "Colors (comma seperated)" -> "colors")
    const normalizeKey = (key: string) => {
      return key.replace(/\([^)]*\)/g, '').trim().toLowerCase().replace(/[\s_-]/g, '');
    };

    const report: UploadReportItem[] = [];

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
        const itemMediaDir = path.resolve(process.cwd(), `data/inventory/${serialNum}`);
        const uploadedImages: Array<{ id: string; url: string }> = [];

        if (fs.existsSync(itemMediaDir)) {
          const files = fs.readdirSync(itemMediaDir);
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

          const heicConvert = require("heic-convert");

          for (const file of imageFiles) {
            const absoluteRawPath = path.join(itemMediaDir, file);
            let fileBuffer = fs.readFileSync(absoluteRawPath);
            const ext = path.extname(file).toLowerCase();

            // Perform HEIC to JPEG conversion in-memory
            if (ext === ".heic" || ext === ".heif") {
              try {
                console.log(`[Bulk Upload] Converting HEIC image ${file} to JPEG...`);
                const converted = await heicConvert({
                  buffer: fileBuffer,
                  format: "JPEG",
                  quality: 0.9
                });
                fileBuffer = Buffer.from(converted);
              } catch (convErr: any) {
                console.error(`[Bulk Upload] HEIC conversion failed for ${file}, trying fallback:`, convErr);
              }
            }

            // Optimize image buffer
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
                uploadResult = await shopifySaree.uploadMedia(uploadName, mimeType, optimizedBuffer);
                break;
              } catch (uploadErr: any) {
                if (attempt === 3) throw uploadErr;
                console.warn(`[Bulk Upload] Upload attempt ${attempt} failed for ${uploadName}, retrying...`, uploadErr.message);
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

        const createdProduct = await shopifySaree.create(payload);

        // Save Cost & Margin to Upstash Redis
        const margin = reportItem.price > 0 ? (reportItem.price - reportItem.costPrice) / reportItem.price : 0;
        await sareeDb.set(sku, {
          costPrice: reportItem.costPrice,
          margin,
          privateNotes: item['privatenotes'] || ''
        });

        reportItem.status = "success";
        reportItem.shopifyId = createdProduct.id;
      } catch (err: any) {
        console.error(`[Bulk Upload API] Failed to upload Saree ${sku}:`, err.message || err);
        reportItem.status = "failed";
        reportItem.error = err.message || String(err);
      }

      report.push(reportItem);
    }

    // Save final report locally in public directory for storefront retrieval / audit trailing
    const reportPath = path.resolve(process.cwd(), "public/bulk-upload-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    console.error("Bulk upload local API fail:", err);
    return NextResponse.json({ error: err.message || "Bulk upload failed" }, { status: 500 });
  }
}
