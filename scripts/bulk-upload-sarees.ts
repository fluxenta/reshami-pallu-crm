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
  console.log("🚀 Starting programmatic bulk Saree and local Media upload with AI lookbook generation...");
  
  const csvPath = path.resolve(process.cwd(), "data/inventory_cleaned.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Cleaned CSV not found at: ${csvPath}. Run clean-csv first!`);
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("YOUR_GEMINI")) {
    console.error("❌ Google Gemini API key not set or invalid in .env.local!");
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const allRows = parseCSV(csvContent);
  const headers = allRows[0];
  const skuColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'sku');
  const dataRows = allRows.slice(2); // Process all sarees

  console.log(`Parsed ${dataRows.length} catalog items from cleaned CSV.`);

  const reportPath = path.resolve(process.cwd(), "public/bulk-upload-report.json");
  let report: UploadReportItem[] = [];

  // Read existing report as a checkpoint checksum
  if (fs.existsSync(reportPath)) {
    try {
      report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      console.log(`Loaded checkpoint report with ${report.length} entries.`);
    } catch (err) {
      console.warn("⚠️ Warning: Could not parse existing checkpoint report, starting fresh.");
    }
  }

  const writeReportCheckpoint = () => {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  };

  // Helper to normalize keys (e.g., "Colors (comma seperated)" -> "colors")
  const normalizeKey = (key: string) => {
    return key.replace(/\([^)]*\)/g, '').trim().toLowerCase().replace(/[\s_-]/g, '');
  };

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

  const POSE_PROMPTS = [
    {
      filename: "model1_ai.jpg",
      pose: "Front Pleats Detail",
      desc: "A professional, high-fashion full-body portrait shot of the model standing upright, facing the camera directly, showcasing the neat front pleats of the saree draped perfectly from the waist to the floor, complete nivi drape view."
    },
    {
      filename: "model2_ai.jpg",
      pose: "Back View Drape",
      desc: "A high-fashion full-body back-view portrait shot of the model looking away from the camera, displaying the beautiful drape of the saree across her back and shoulders, showcasing how the fabric falls gracefully from the backside."
    },
    {
      filename: "model3_ai.jpg",
      pose: "Pallu Fall Close-up",
      desc: "A high-fashion medium close-up shot focusing on the model's shoulder and upper torso, showcasing the decorative pallu section falling elegantly over her left shoulder, highlighting the elaborate printed or embroidered pallu patterns clearly."
    }
  ];

  const skinTones = ["Dusky Indian skin tone", "Olive Indian skin tone", "Fair Indian skin tone"];
  const backdrops = [
    "minimalist modern light-filled studio, terracotta planters, soft shadows",
    "royal heritage Indian palace courtyard, sandstone arches, warm natural sunlight",
    "luxury indoor minimalist living space, aesthetic wooden panels, warm spotlighting",
    "luxury pool, turquoise water, sunbeds, palm shadows, sunny daylight"
  ];

  for (const row of dataRows) {
    const item: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const normKey = normalizeKey(h);
      item[normKey] = row[idx] || '';
    });

    const serialNum = item['serialnumber'];
    let sku = item['sku'];
    if (!sku && serialNum) {
      sku = `RP-SAREE-${serialNum}`;
      if (skuColIdx >= 0) {
        row[skuColIdx] = sku;
      }
    }
    let title = item['title'];

    // Fallback for Serial Number 28 where Title is empty
    if (serialNum === '28' && !title) {
      title = 'Lavender Starlight Saree';
    }

    if (!serialNum || !title) continue;

    // Check if successfully uploaded in a previous checkpoint run (override for Saree 16)
    const existingSuccess = report.find(r => r.serialNumber === serialNum && r.status === "success" && r.imagesCount > 0);
    if (existingSuccess && serialNum !== '16') {
      console.log(`  ✓ SKU ${sku} (Saree ${serialNum}) already uploaded successfully in previous checkpoint. Skipping.`);
      continue;
    }

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
      // 1. Pre-flight directory check
      const itemMediaDir = path.resolve(process.cwd(), `data/inventory/${serialNum}`);
      if (!fs.existsSync(itemMediaDir)) {
        console.warn(`  ⚠️ Media directory not found: ${itemMediaDir}`);
      }

      const { shopifySaree, shopifyAdminFetch } = await import("../src/lib/shopify");

      // Discover current local files in folder
      let filesInDir = fs.existsSync(itemMediaDir) ? fs.readdirSync(itemMediaDir) : [];
      let referenceImages = filesInDir.filter(file => {
        const ext = path.extname(file).toLowerCase();
        const base = path.basename(file).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext) && !base.includes("_ai");
      });

      // 2. Generate model photos if reference images exist and model shoots aren't already present on disk
      const generatedModelFiles = filesInDir.filter(f => f.toLowerCase().includes("_ai.jpg"));
      if (referenceImages.length > 0 && generatedModelFiles.length < 3 && serialNum !== '36') {
        console.log(`  ⏳ Running Model Generation pipeline using Gemini & Imagen...`);

        // Load first image as primary reference
        const primaryImageName = referenceImages[0];
        const primaryImagePath = path.join(itemMediaDir, primaryImageName);
        const primaryMimeType = primaryImageName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        const primaryImageBase64 = fs.readFileSync(primaryImagePath).toString("base64");

        // Load up to 3 image parts for Gemini context
        const inputParts = referenceImages.slice(0, 3).map(imgName => {
          const imgPath = path.join(itemMediaDir, imgName);
          const mime = imgName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
          return {
            inlineData: { mimeType: mime, data: fs.readFileSync(imgPath).toString("base64") }
          };
        });

        // Step A: Call Gemini 2.5 Pro for rich weave & fabric structure analysis
        console.log("  - Analyzing original fabric and border print using Gemini 2.5 Pro...");
        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
        const analysisPrompt = `
          Analyze the uploaded saree photos showing different angles/details of the same saree. 
          Write a highly detailed, extremely precise description of this saree across all angles.
          You MUST return the output as a valid JSON object matching the following structure:
          {
            "base_color": "the primary color of the saree body",
            "accent_colors": ["list", "of", "secondary", "pattern/motif", "colors"],
            "border_design": "highly detailed description of borders, scalloping, pearl strings, waves, or threadwork",
            "pallu_design": "elaborate description of the decorative pallu section and its printed or embroidered elements",
            "fabric": "exact material texture e.g. sheer organza, katan silk, georgette, tissue",
            "motifs": "exact printed or embroidered patterns e.g. butterflies, lilies, flowers, vines",
            "weave_style": "e.g. digital printing, handwoven kadhua, jamdani, jacquard zari",
            "drape_style": "standard pleated nivi draping style recommendations",
            "catalog_requirements": "details about matching blouse, studio lighting, and high-fashion modeling parameters"
          }
          Return ONLY the raw JSON object inside your response content. Do not include markdown code block characters like \`\`\`json.
        `;

        let sareeDescription = "A premium handwoven saree with detailed borders and rich fabric textures.";
        const analysisRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: analysisPrompt }, ...inputParts] }]
          })
        });

        if (analysisRes.ok) {
          const geminiData = await analysisRes.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          try {
            let cleanJsonText = rawText.trim();
            if (cleanJsonText.startsWith("```json")) {
              cleanJsonText = cleanJsonText.substring(7, cleanJsonText.length - 3).trim();
            } else if (cleanJsonText.startsWith("```")) {
              cleanJsonText = cleanJsonText.substring(3, cleanJsonText.length - 3).trim();
            }
            const parsedJson = JSON.parse(cleanJsonText);
            sareeDescription = `An opulent, flowing ${parsedJson.fabric} saree featuring a base color of ${parsedJson.base_color} accented with ${parsedJson.accent_colors.join(", ")}, intricately detailed with ${parsedJson.motifs} in ${parsedJson.weave_style} style, featuring a gorgeous pallu with ${parsedJson.pallu_design}, finished with a border of ${parsedJson.border_design}. Styled with a matching blouse and recommendation: ${parsedJson.catalog_requirements}.`;
            console.log(`  ✓ Gemini 2.5 Pro parsed fabric description: "${parsedJson.fabric} Saree in ${parsedJson.base_color}"`);
          } catch (jsonErr) {
            sareeDescription = rawText;
          }
        } else {
          const errText = await analysisRes.text();
          throw new Error(`Fabric analysis failed: Status ${analysisRes.status} - ${errText}`);
        }

        // Consistent model attributes and background for unified catalog theme
        const modelTone = "Olive Indian skin tone";
        const backgroundVibe = "a high-end luxury fashion studio with a sun-drenched warm champagne and soft peach plaster wall, elegant architectural arches, soft natural sunlight streaming through a large window creating beautiful, high-contrast soft shadow patterns, decorated with minimalist premium dried pampas grass in a ceramic vase, sophisticated warm editorial fashion lighting, and premium magazine catalog photography";

        // Step B: Generate 3 pose shots
        for (const poseConfig of POSE_PROMPTS) {
          const finalLocalPath = path.join(itemMediaDir, poseConfig.filename);
          if (fs.existsSync(finalLocalPath)) {
            console.log(`  ✓ Local shoot ${poseConfig.filename} already generated.`);
            continue;
          }

          console.log(`  - Generating model photo for pose: ${poseConfig.pose}...`);
          let modelGeneratedBytes = "";
          let apiSuccess = false;
          let generatedByGemini = false;

          // 1. Primary: Gemini 3.1 Flash Image (highly accurate visual drape)
          const geminiImageUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`;
          const promptText = `Put this exact saree on the same elegant, professional Indian model named Maya, featuring a consistent beautiful face with symmetric facial features and identical soft smile across all shots, with a professional ${modelTone} skin tone, wearing a custom-tailored matching saree blouse that perfectly coordinates in color, design, and pattern with the saree, and draped elegantly in this exact saree, standing in a luxurious ${backgroundVibe} setting. Strictly preserve all original patterns, colors, textures, borders, and print details of the saree. Focus on catalog studio lighting, high resolution, intricate fabric weave textures, complete drape focus, photorealistic. Camera shot and angle instructions: ${poseConfig.desc}. Return the final generated model image directly as an image asset.`;

          try {
            const imgRes = await fetch(geminiImageUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }, ...inputParts] }]
              })
            });

            if (imgRes.ok) {
              const imgData = await imgRes.json();
              const bytes = imgData.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)?.inlineData?.data || imgData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
              if (bytes) {
                modelGeneratedBytes = bytes;
                apiSuccess = true;
                generatedByGemini = true;
                console.log(`    ✓ gemini-3.1-flash-image successfully generated model photo.`);
              }
            }
          } catch (geminiErr: any) {
            console.warn(`    ⚠️ gemini-3.1-flash-image failed: ${geminiErr.message}`);
          }

          // 2. Fallback 1: Imagen 4 Ultra
          if (!apiSuccess) {
            console.log("    ⏳ Falling back to Imagen 4 Ultra...");
            const poseDescription = `A specific, professional Indian model named Maya, featuring a highly consistent beautiful face, symmetric facial features, identical soft smile and hairstyle across all angles, with a professional ${modelTone} skin tone, wearing a custom-tailored matching saree blouse that perfectly coordinates in color, design, and pattern with the saree, elegantly draped in the EXACT saree from the reference image. The saree's exact colors, borders, fabric texture, weave patterns, and print details from the reference image must be perfectly preserved and strictly replicated with zero changes. Do not introduce any new colors, flowers, motifs, borders, or patterns. She is standing in a luxurious ${backgroundVibe} setting. Camera framing & shot angle: ${poseConfig.desc}. Professional catalog studio lighting, award-winning fashion editorial photography, high resolution, photorealistic, intricate fabric weave textures, complete drape focus.`;
            const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict?key=${apiKey}`;

            try {
              const imagenRes = await fetch(imagenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  instances: [{
                    prompt: poseDescription,
                    imagePrompt: { image: { imageBytes: primaryImageBase64 } }
                  }],
                  parameters: { sampleCount: 1, outputMimeType: "image/jpeg", aspectRatio: "3:4" }
                })
              });

              if (imagenRes.ok) {
                const imagenData = await imagenRes.json();
                const bytes = imagenData.predictions?.[0]?.bytesBase64Encoded || imagenData.generatedImages?.[0]?.image?.imageBytes;
                if (bytes) {
                  modelGeneratedBytes = bytes;
                  apiSuccess = true;
                  console.log(`    ✓ Imagen 4 Ultra successfully generated model photo.`);
                }
              }
            } catch (err) {
              console.warn(`    ⚠️ Imagen 4 Ultra failed:`, err);
            }
          }

          // 3. Fallback 2: Imagen 4 Standard
          if (!apiSuccess) {
            console.log("    ⏳ Falling back to Imagen 4 Standard...");
            const poseDescription = `A specific, professional Indian model named Maya, featuring a highly consistent beautiful face, symmetric facial features, identical soft smile and hairstyle across all angles, with a professional ${modelTone} skin tone, wearing a custom-tailored matching saree blouse that perfectly coordinates in color, design, and pattern with the saree, elegantly draped in the EXACT saree from the reference image. The saree's exact colors, borders, fabric texture, weave patterns, and print details from the reference image must be perfectly preserved and strictly replicated with zero changes. She is standing in a luxurious ${backgroundVibe} setting. Camera framing & shot angle: ${poseConfig.desc}. Professional catalog studio lighting, award-winning fashion editorial photography, high resolution, photorealistic, intricate fabric weave textures, complete drape focus.`;
            const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;

            try {
              const imagenRes = await fetch(imagenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  instances: [{
                    prompt: poseDescription,
                    imagePrompt: { image: { imageBytes: primaryImageBase64 } }
                  }],
                  parameters: { sampleCount: 1, outputMimeType: "image/jpeg", aspectRatio: "3:4" }
                })
              });

              if (imagenRes.ok) {
                const imagenData = await imagenRes.json();
                const bytes = imagenData.predictions?.[0]?.bytesBase64Encoded || imagenData.generatedImages?.[0]?.image?.imageBytes;
                if (bytes) {
                  modelGeneratedBytes = bytes;
                  apiSuccess = true;
                  console.log(`    ✓ Imagen 4 Standard successfully generated model photo.`);
                }
              }
            } catch (err) {
              console.warn(`    ⚠️ Imagen 4 Standard failed:`, err);
            }
          }

          // If all model generators fail, HALT immediately and write checkpoint
          if (!apiSuccess) {
            console.error(`\n❌ CRITICAL: Model generation failed for Saree Serial ${serialNum} (${title}) on pose: ${poseConfig.pose}.`);
            reportItem.status = "failed";
            reportItem.error = `Failed to generate model shot for pose: ${poseConfig.pose}`;
            
            // Upsert failure in report, save, and exit
            const index = report.findIndex(r => r.serialNumber === serialNum);
            if (index >= 0) report[index] = reportItem;
            else report.push(reportItem);
            writeReportCheckpoint();

            console.error("💾 Checkpoint report saved. Halting execution to prevent duplicate charges.");
            process.exit(1);
          }

          // Upscale the output if generated by Gemini 3.1 Flash Image to make it high resolution
          let finalImageBuffer = Buffer.from(modelGeneratedBytes, "base64");
          if (generatedByGemini) {
            console.log(`    ⏳ Proportionally upscaling generated Gemini photo (width: 1800) and sharpening...`);
            finalImageBuffer = (await sharp(finalImageBuffer)
              .resize({ width: 1800 })
              .sharpen(1.0, 1.0, 1.0)
              .toBuffer()) as any;
          }

          // Save generated file to disk
          fs.writeFileSync(finalLocalPath, finalImageBuffer);
          console.log(`    ✓ Generated shoot saved locally to: ${finalLocalPath}`);

          // Add a minor safety delay between Vertex AI/Gemini requests
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // Check if product with Title or SKU already exists on Shopify
      let existingProductId: string | null = null;
      let existingImagesCount = 0;
      let existingVariantId: string | null = null;
      let existingSku: string | null = null;
      
      const checkRes = await shopifyAdminFetch<any>({
        query: `
          query getProductBySku($query: String!) {
            products(first: 1, query: $query) {
              edges {
                node {
                  id
                  variants(first: 1) {
                    edges {
                      node {
                        id
                        sku
                      }
                    }
                  }
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
        variables: { query: `title:'${toTitleCase(title).replace(/'/g, "\\'")}' OR sku:${sku}` }
      });

      const edges = checkRes.products?.edges || [];
      if (edges.length > 0) {
        existingProductId = edges[0].node.id;
        existingImagesCount = edges[0].node.media?.edges?.length || 0;
        existingVariantId = edges[0].node.variants?.edges?.[0]?.node.id || null;
        existingSku = edges[0].node.variants?.edges?.[0]?.node.sku || null;
        
        // If it exists and already has images, perform in-place SKU/Tag/Cost updates and skip regeneration/upload
        if (existingImagesCount > 0) {
          console.log(`  ✓ Saree "${title}" already exists on Shopify. Performing in-place SKU/Tag/Cost updates...`);
          
          // 1. Update SKU if needed
          if (existingVariantId && existingSku !== sku) {
            console.log(`    Updating variant SKU to ${sku}...`);
            await shopifyAdminFetch<any>({
              query: `
                mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                    userErrors {
                      message
                    }
                  }
                }
              `,
              variables: {
                productId: existingProductId,
                variants: [{ id: existingVariantId, inventoryItem: { sku } }]
              }
            });
          }

          // 2. Prepare fabric and occasion tags
          const tagsField = item['tags'] || item['tagscommaseperated'] || '';
          const tags = tagsField ? tagsField.split(',').map(t => t.trim()).filter(Boolean) : [];
          
          if (item['foundersexclusive']?.toUpperCase() === 'TRUE' && !tags.includes('Founders-Exclusive')) {
            tags.push('Founders-Exclusive');
          }

          // 3. Update tags and title on Shopify
          console.log(`    Updating product tags and title to "${toTitleCase(title)}"...`);
          await shopifyAdminFetch<any>({
            query: `
              mutation productUpdate($input: ProductInput!) {
                productUpdate(input: $input) {
                  userErrors {
                    message
                  }
                }
              }
            `,
            variables: {
              input: {
                id: existingProductId,
                title: toTitleCase(title),
                tags
              }
            }
          });

          // 4. Save Cost Price to Upstash Redis
          const margin = reportItem.price > 0 ? (reportItem.price - reportItem.costPrice) / reportItem.price : 0;
          await sareeDb.set(sku, {
            costPrice: reportItem.costPrice,
            margin,
            privateNotes: item['privatenotes'] || ''
          });
          console.log(`    ✓ Saved private cost metrics to Upstash Redis under SKU ${sku}`);

          reportItem.status = "success";
          reportItem.shopifyId = existingProductId!;
          reportItem.imagesCount = existingImagesCount;
          reportItem.sku = sku;
          
          const index = report.findIndex(r => r.serialNumber === serialNum);
          if (index >= 0) report[index] = reportItem;
          else report.push(reportItem);
          writeReportCheckpoint();
          continue;
        }
        console.log(`  ⚠️ Saree "${title}" exists but has 0 images. Proceeding to upload images...`);
      }

      // 3. Discover local images (which now include model1_ai.jpg, model2_ai.jpg, model3_ai.jpg)
      const uploadedImages: Array<{ id: string; url: string }> = [];

      if (fs.existsSync(itemMediaDir)) {
        const files = fs.readdirSync(itemMediaDir);
        // Only keep standard image files (ignore video shoots like .mp4, .mov)
        let imageFiles = files.filter(file => {
          const ext = path.extname(file).toLowerCase();
          return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext);
        });

        // For serial number 16, do NOT upload the pictures already there in the folder (i.e. only upload the generated model*_ai.jpg photos)
        if (serialNum === '16') {
          imageFiles = imageFiles.filter(file => file.toLowerCase().includes("_ai.jpg"));
        }

        // Prioritize model photos (model1_ai, model2_ai, model3_ai) first, then other pictures
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

        console.log(`  Found ${imageFiles.length} total images to upload for serial number ${serialNum}`);

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
      }

      reportItem.imagesCount = uploadedImages.length;

      const cleanTitle = toTitleCase(title);
      const cleanFabric = cleanFieldList(item['fabric']);
      const cleanWeave = cleanFieldList(item['weave'] || item['weaveoptional']);
      const cleanColors = cleanFieldList(item['colors'] || item['colorscommaseperated']);
      const cleanOccasion = cleanFieldList(item['occasion'] || item['occasioncommaseperated']);
      const cleanWashCare = cleanFieldList(item['washcare'] || 'Dry Wash Only');

      // 4. Prepare product creation/update payload
      const tagsField = item['tags'] || item['tagscommaseperated'] || '';
      const tags = tagsField ? tagsField.split(',').map(t => t.trim()).filter(Boolean) : [];
      
      
      const payload = {
        title: cleanTitle,
        handle: "",
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

      // 5. Save Weaver Cost & Margin to Upstash Redis
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

    const index = report.findIndex(r => r.serialNumber === serialNum);
    if (index >= 0) report[index] = reportItem;
    else report.push(reportItem);
    writeReportCheckpoint();
  }

  // Write the updated CSV back to disk
  console.log(`💾 Writing updated SKUs back to CSV: ${csvPath}`);
  const stringifyCSV = (rows: string[][]): string => {
    return rows.map(r => 
      r.map(cell => {
        const val = cell || '';
        if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    ).join('\n');
  };
  fs.writeFileSync(csvPath, stringifyCSV(allRows), 'utf-8');

  console.log(`\n🎉 Bulk upload process finished successfully! Report saved to: ${reportPath}`);
}

runBulkUpload().catch(console.error);
