import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";
import { shopifySaree, shopifyAdminFetch } from "@/lib/shopify";
import { sareeDb, db } from "@/lib/db";

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

// Extract Spreadsheet ID from sheet link
function extractSpreadsheetId(url: string): string | null {
  const matches = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return matches ? matches[1] : url;
}

// Extract Drive Folder ID from folder link
function extractDriveFolderId(url: string): string | null {
  const matches = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  return matches ? matches[1] : url;
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

export async function GET(req: NextRequest) {
  try {
    if (!await verifySession()) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const isProgressRequest = searchParams.get("progress") === "true";
    if (isProgressRequest) {
      const progress = await db.get("google-sync:progress") || { step: 0, text: "Idle", status: "idle", log: "" };
      return NextResponse.json(progress);
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    const sheetUrl = "https://docs.google.com/spreadsheets/d/1vdxcGu_rxqJLSW7HJcRPhrek-WLMBtIAccIfnfwTswA/edit?gid=1836349698#gid=1836349698";
    const sheetId = extractSpreadsheetId(sheetUrl);

    if (!sheetId) {
      return NextResponse.json({ error: "Invalid sheet URL" }, { status: 400 });
    }

    const cachePath = path.join(os.tmpdir(), "google_sheet_cache.csv");
    let csvContent = "";
    let fetched = false;

    const forceRefresh = searchParams.get("refresh") === "true";

    if (fs.existsSync(cachePath) && !forceRefresh) {
      csvContent = fs.readFileSync(cachePath, "utf-8");
      console.log(`[Google Sync API GET] Loaded Google Sheet from local cache.`);
    } else {
      console.log(`[Google Sync API GET] ${forceRefresh ? "Force refreshing" : "Cache not found"}. Fetching from Google...`);
      const csvExportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const csvRes = await fetch(csvExportUrl, { cache: "no-store" });
      if (csvRes.ok) {
        csvContent = await csvRes.text();
        fs.writeFileSync(cachePath, csvContent, "utf-8");
        fetched = true;
        console.log(`[Google Sync API GET] Fetched and saved to cache.`);
      } else if (fs.existsSync(cachePath)) {
        csvContent = fs.readFileSync(cachePath, "utf-8");
        console.log(`[Google Sync API GET] Fetch failed, falling back to existing cache.`);
      } else {
        throw new Error(`Failed to fetch Google Sheet and no cache exists.`);
      }
    }

    const allRows = parseCSV(csvContent);
    if (allRows.length < 2) {
      return NextResponse.json({ items: [], validationErrors: [] });
    }

    const headers = allRows[0];
    const dataRows = allRows.slice(2);
    const normalizeKey = (key: string) => {
      return key.replace(/\([^)]*\)/g, '').trim().toLowerCase().replace(/[\s_-]/g, '');
    };

    // Extract Drive Folder ID
    const driveUrl = "https://drive.google.com/drive/u/4/folders/1mxvLUG0u-RIH9Uoxt4q7nWvEQY1dPxPD";
    const driveId = extractDriveFolderId(driveUrl);
    let folderMap: Record<string, string> = {};
    let driveChecked = false;

    if (apiKey && driveId) {
      try {
        const listFoldersUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${driveId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        )}&key=${apiKey}&fields=files(id,name)&pageSize=1000`;
        const driveFolderRes = await fetch(listFoldersUrl, { cache: "no-store" });
        if (driveFolderRes.ok) {
          const driveFoldersData = await driveFolderRes.json();
          const foldersList = driveFoldersData.files || [];
          foldersList.forEach((folder: any) => {
            folderMap[folder.name.trim()] = folder.id;
          });
          driveChecked = true;
        }
      } catch (e) {
        console.error("[Google Sync GET] Drive check error:", e);
      }
    }

    const validationErrors: Array<{
      serialNumber: string;
      sku: string;
      title: string;
      errors: string[];
      rowNumber: number;
    }> = [];

    const items = dataRows.map((row, index) => {
      const rowNumber = index + 3; // +3 to adjust for header + instructions row (offset of 2 rows)
      const item: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const normKey = normalizeKey(h);
        item[normKey] = row[idx] || '';
      });

      const serialNum = item['serialnumber']?.trim();
      const sku = item['sku']?.trim() || (serialNum ? `RP-INV-${serialNum}` : '');
      let title = item['title']?.trim();
      if (serialNum === '28' && !title) {
        title = 'Lavender Starlight Saree';
      }

      const isUploaded = item['uploaded']?.toUpperCase() === 'Y' || item['uploadedy/n']?.toUpperCase() === 'Y';

      if (serialNum || title || sku) {
        const errors: string[] = [];
        if (!serialNum) {
          errors.push("Serial number is missing");
        }
        if (!title) {
          errors.push("Title is missing");
        }

        const price = parseFloat(item['price']);
        if (isNaN(price) || price <= 0) {
          errors.push(`Price is invalid or zero (${item['price'] || 'empty'})`);
        }

        const costPrice = parseFloat(item['costprice']);
        if (isNaN(costPrice) || costPrice <= 0) {
          errors.push(`Cost price is invalid or zero (${item['costprice'] || 'empty'})`);
        } else if (!isNaN(price) && costPrice > price) {
          errors.push(`Cost price (₹${costPrice}) is higher than selling price (₹${price})`);
        }

        const stock = parseInt(item['stock']);
        if (isNaN(stock) || stock < 0) {
          errors.push(`Stock is invalid or negative (${item['stock'] || 'empty'})`);
        }

        if (!item['fabric']?.trim()) {
          errors.push("Fabric type is missing");
        }

        const weave = item['weave']?.trim() || item['weaveoptional']?.trim();
        if (!weave) {
          errors.push("Weave style is missing");
        }

        const colors = item['colors']?.trim() || item['colorscommaseperated']?.trim();
        if (!colors) {
          errors.push("Colors/Color Family is missing");
        }

        if (!isUploaded && driveChecked && serialNum) {
          const folderId = folderMap[serialNum];
          if (!folderId) {
            errors.push(`Drive folder named '${serialNum}' is missing under the parent Google Drive folder`);
          }
        }

        if (errors.length > 0) {
          validationErrors.push({
            serialNumber: serialNum || `Row ${rowNumber}`,
            sku: sku || 'N/A',
            title: title || 'N/A',
            errors,
            rowNumber
          });
        }
      }

      return {
        serialNumber: serialNum || '',
        sku,
        title: title || '',
        price: parseFloat(item['price']) || 0,
        costPrice: parseFloat(item['costprice']) || 0,
        stock: parseInt(item['stock']) || 0,
        fabric: item['fabric'] || '',
        weave: item['weave'] || item['weaveoptional'] || '',
        colors: item['colors'] || item['colorscommaseperated'] || '',
        uploaded: isUploaded ? "Y" : "N"
      };
    }).filter(i => i.serialNumber && i.title);

    return NextResponse.json({ success: true, items, validationErrors, cached: !fetched });
  } catch (err: any) {
    console.error("Google Sync GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to load cached sheet" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!await verifySession()) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const body = await req.json();
    const { sheetUrl, driveUrl } = body;

    await db.set("google-sync:progress", { step: 1, text: "Validating spreadsheet catalog...", status: "active", log: "Reading Google Sheet columns..." });

    if (!sheetUrl || !driveUrl) {
      return NextResponse.json({ error: "Google Sheet URL and Google Drive URL are required." }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Google API Key / GEMINI_API_KEY is not configured in .env.local" }, { status: 500 });
    }

    const sheetId = extractSpreadsheetId(sheetUrl);
    const driveId = extractDriveFolderId(driveUrl);

    if (!sheetId || !driveId) {
      return NextResponse.json({ error: "Invalid Google Sheet or Google Drive folder URL/ID" }, { status: 400 });
    }

    console.log(`[Google Sync API] Starting sync. Sheet ID: ${sheetId}, Drive ID: ${driveId}`);

    // 1. Fetch Google Sheet CSV & Cache Locally
    const cachePath = path.join(os.tmpdir(), "google_sheet_cache.csv");
    const csvExportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    let csvContent = "";

    try {
      console.log(`[Google Sync API] Fetching sheet from Google...`);
      const csvRes = await fetch(csvExportUrl, { cache: "no-store" });
      if (csvRes.ok) {
        csvContent = await csvRes.text();
        fs.writeFileSync(cachePath, csvContent, "utf-8");
        console.log(`[Google Sync API] Saved sheet to local cache.`);
      } else if (fs.existsSync(cachePath)) {
        csvContent = fs.readFileSync(cachePath, "utf-8");
        console.log(`[Google Sync API] Failed to fetch. Loaded sheet from local cache.`);
      } else {
        throw new Error(`Failed to fetch Google Sheet and no cache exists.`);
      }
    } catch (err: any) {
      if (fs.existsSync(cachePath)) {
        csvContent = fs.readFileSync(cachePath, "utf-8");
        console.log(`[Google Sync API] Error occurred. Loaded sheet from local cache.`);
      } else {
        throw err;
      }
    }

    const allRows = parseCSV(csvContent);
    if (allRows.length < 2) {
      throw new Error("Google Sheet CSV appears to be empty or malformed.");
    }

    const headers = allRows[0];
    const dataRows = allRows.slice(2); // Skip headers

    // Helper to normalize keys
    const normalizeKey = (key: string) => {
      return key.replace(/\([^)]*\)/g, '').trim().toLowerCase().replace(/[\s_-]/g, '');
    };

    // 2. Fetch Google Drive Folders mapping serial numbers to drive folder IDs
    await db.set("google-sync:progress", { step: 2, text: "Mapping serial numbers to Google Drive...", status: "active", log: "Fetching folder lists from parent Google Drive folder..." });
    const listFoldersUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${driveId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    )}&key=${apiKey}&fields=files(id,name)&pageSize=1000`;

    const driveFolderRes = await fetch(listFoldersUrl, { cache: "no-store" });
    if (!driveFolderRes.ok) {
      throw new Error(`Failed to list folders in Google Drive (Status ${driveFolderRes.status}). Verify API Key and Folder permissions.`);
    }
    const driveFoldersData = await driveFolderRes.json();
    const foldersList: Array<{ id: string; name: string }> = driveFoldersData.files || [];

    const folderMap: Record<string, string> = {};
    foldersList.forEach(folder => {
      folderMap[folder.name.trim()] = folder.id;
    });

    // 3. Pre-flight check: scan for new rows that need syncing
    const newRowsToSync = [];
    const inventoryDir = path.join(os.tmpdir(), "inventory");
    await db.set("google-sync:progress", { step: 3, text: "Scanning Drive folders and cache for new sarees...", status: "active", log: "Locating new non-uploaded serial number image folders..." });
    if (!fs.existsSync(inventoryDir)) {
      fs.mkdirSync(inventoryDir, { recursive: true });
    }

    for (const row of dataRows) {
      const item: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const normKey = normalizeKey(h);
        item[normKey] = row[idx] || '';
      });

      const serialNum = item['serialnumber'];
      const sku = item['sku'] || `RP-INV-${serialNum}`;
      let title = item['title'];
      if (serialNum === '28' && !title) {
        title = 'Lavender Starlight Saree';
      }

      if (!serialNum || !title) continue;

      // Has it been marked as Uploaded in the Google Sheet already?
      const isUploadedInSheet = item['uploaded']?.toUpperCase() === 'Y' || item['uploadedy/n']?.toUpperCase() === 'Y';
      if (isUploadedInSheet) {
        continue; // Skip already uploaded sarees
      }

      // Check Shopify product existence
      let existingProductId: string | null = null;
      let existingImagesCount = 0;

      try {
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
          variables: { query: `title:'${title.replace(/'/g, "\\'")}' OR sku:${sku}` }
        });
        const edges = checkRes.products?.edges || [];
        if (edges.length > 0) {
          existingProductId = edges[0].node.id;
          existingImagesCount = edges[0].node.media?.edges?.length || 0;
        }
      } catch (err) {}

      // If it doesn't exist on Shopify OR exists but has 0 images, it is a valid candidate for sync
      if (!existingProductId || existingImagesCount === 0) {
        const subfolderId = folderMap[serialNum.trim()];
        if (subfolderId) {
          // Verify if there are images inside this subfolder
          const listImagesUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
            `'${subfolderId}' in parents and trashed = false and mimeType contains 'image/'`
          )}&key=${apiKey}&fields=files(id,name,mimeType)&pageSize=5`;
          
          const imgListRes = await fetch(listImagesUrl, { cache: "no-store" });
          if (imgListRes.ok) {
            const imgListData = await imgListRes.json();
            if (imgListData.files && imgListData.files.length > 0) {
              newRowsToSync.push({ row, item, serialNum, sku, title, subfolderId });
            }
          }
        }
      }
    }

    // 4. Quick Close if nothing is there to sync
    if (newRowsToSync.length === 0) {
      console.log(`[Google Sync API] No new sarees or folder images found. Exiting sync early.`);
      return NextResponse.json({ success: true, message: "Nothing to sync", report: [] });
    }

    console.log(`[Google Sync API] Found ${newRowsToSync.length} new row(s) to synchronize.`);
    const report: UploadReportItem[] = [];

    // 5. Process each new row
    for (const syncJob of newRowsToSync) {
      const { item, serialNum, sku, title, subfolderId } = syncJob;
      const itemMediaDir = path.join(inventoryDir, serialNum);
      if (!fs.existsSync(itemMediaDir)) {
        fs.mkdirSync(itemMediaDir, { recursive: true });
      }

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

      await db.set("google-sync:progress", { 
        step: 4, 
        text: `AI Photoshoot: Saree ${serialNum}`, 
        status: "active", 
        log: `Downloading raw images for Saree ${serialNum} and executing Gemini fabric analysis & Imagen model generations...` 
      });

      try {
        // Download images from subfolder
        const listImagesUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${subfolderId}' in parents and trashed = false and mimeType contains 'image/'`
        )}&key=${apiKey}&fields=files(id,name,mimeType)&orderBy=name&pageSize=1000`;

        const imgListRes = await fetch(listImagesUrl, { cache: "no-store" });
        if (!imgListRes.ok) {
          throw new Error(`Failed to list images in Google Drive subfolder ${serialNum}`);
        }
        const imgListData = await imgListRes.json();
        const driveImageFiles: Array<{ id: string; name: string; mimeType: string }> = imgListData.files || [];

        for (const file of driveImageFiles) {
          const localPath = path.join(itemMediaDir, file.name);
          if (!fs.existsSync(localPath)) {
            console.log(`  Downloading raw image ${file.name} to local folder...`);
            const dlUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;
            const dlRes = await fetch(dlUrl, { cache: "no-store" });
            if (dlRes.ok) {
              const arrayBuffer = await dlRes.arrayBuffer();
              fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
            }
          }
        }

        const filesInDir = fs.readdirSync(itemMediaDir);
        const referenceImages = filesInDir.filter(file => {
          const ext = path.extname(file).toLowerCase();
          const base = path.basename(file).toLowerCase();
          return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext) && !base.includes("_ai");
        });

        const generatedModelFiles = filesInDir.filter(f => f.toLowerCase().includes("_ai.jpg"));
        let sareeDescription = item['description'] || item['descriptionoptional'] || "";

        // Run AI Photoshoot Generation and Fabric analysis
        if (referenceImages.length > 0) {
          const primaryImageName = referenceImages[0];
          const primaryImagePath = path.join(itemMediaDir, primaryImageName);
          const primaryImageBase64 = fs.readFileSync(primaryImagePath).toString("base64");

          const inputParts = referenceImages.slice(0, 3).map(imgName => {
            const imgPath = path.join(itemMediaDir, imgName);
            const mime = imgName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
            return {
              inlineData: { mimeType: mime, data: fs.readFileSync(imgPath).toString("base64") }
            };
          });

          // Generate description if not present using Gemini
          if (!sareeDescription) {
            console.log(`  [AI Generation] Description is missing. Generating with Gemini...`);
            const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
            const analysisPrompt = `
              Analyze the uploaded saree photos showing different angles/details of the same saree. 
              Write a highly detailed, extremely precise description of this saree across all angles.
              Return a valid JSON object only:
              {
                "base_color": "the primary color of the saree body",
                "accent_colors": ["patterns"],
                "border_design": "details",
                "pallu_design": "details",
                "fabric": "texture",
                "motifs": "patterns",
                "weave_style": "zari style",
                "drape_style": "recommendation",
                "catalog_requirements": "lighting requirements"
              }
            `;

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
                sareeDescription = `An opulent, flowing ${parsedJson.fabric} saree featuring a base color of ${parsedJson.base_color} accented with ${parsedJson.accent_colors.join(", ")}, intricately detailed with ${parsedJson.motifs} in ${parsedJson.weave_style} style, featuring a gorgeous pallu with ${parsedJson.pallu_design}, finished with a border of ${parsedJson.border_design}.`;
              } catch (jsonErr) {
                sareeDescription = rawText;
              }
            }
          }

          // Generate lookbook photos if they are not generated
          if (generatedModelFiles.length < 3) {
            console.log(`  [AI Generation] Generating lookbook model photos...`);
            const modelTone = "Olive Indian skin tone";
            const backgroundVibe = "a high-end luxury fashion studio with a sun-drenched warm champagne and soft peach plaster wall, elegant architectural arches, soft natural shadow patterns";

            for (const poseConfig of POSE_PROMPTS) {
              const finalLocalPath = path.join(itemMediaDir, poseConfig.filename);
              if (fs.existsSync(finalLocalPath)) continue;

              let modelGeneratedBytes = "";
              let apiSuccess = false;
              let generatedByGemini = false;

              // Gemini 3.1 Flash Image
              const geminiImageUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`;
              const promptText = `Put this exact saree on the same elegant, professional Indian model named Maya, featuring a consistent beautiful face with symmetric facial features and identical soft smile across all shots, with a professional ${modelTone} skin tone, wearing a custom-tailored matching saree blouse that perfectly coordinates in color, design, and pattern with the saree, and draped elegantly in this exact saree, standing in a luxurious ${backgroundVibe} setting. Strictly preserve all original patterns, colors, textures, borders, and print details. Camera: ${poseConfig.desc}. Return the final generated model image directly as an image asset.`;

              try {
                console.log(`  [AI Generation] Requesting gemini-3.1-flash-image for pose: ${poseConfig.pose}...`);
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
                    console.log(`  ✓ [AI Generation] gemini-3.1-flash-image generated successfully for ${poseConfig.pose}.`);
                  } else {
                    console.warn(`  ⚠️ [AI Generation] gemini-3.1-flash-image succeeded but did not return image bytes.`);
                  }
                } else {
                  const errText = await imgRes.text();
                  console.error(`  [AI Generation] gemini-3.1-flash-image failed with status ${imgRes.status}:`, errText);
                }
              } catch (err: any) {
                console.error(`  [AI Generation] gemini-3.1-flash-image exception:`, err.message || err);
              }

              // Imagen Fallback
              if (!apiSuccess) {
                const poseDescription = `A professional Indian model named Maya, consistent face, soft smile, ${modelTone} skin tone, wearing a custom blouse, draped in the exact saree from the reference image. She is standing in a luxurious ${backgroundVibe} setting. Pose: ${poseConfig.desc}.`;
                const fallbackModels = ["imagen-4.0-generate-001", "imagen-4.0-fast-generate-001"];

                for (const modelName of fallbackModels) {
                  const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`;
                  console.log(`  [AI Generation] Falling back to standard Imagen: ${modelName} for pose: ${poseConfig.pose}...`);

                  try {
                    const imagenRes = await fetch(imagenUrl, {
                      method: "POST",
                      headers: { 
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey 
                      },
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
                        console.log(`  ✓ [AI Generation] Fallback ${modelName} generated successfully for ${poseConfig.pose}.`);
                        break;
                      }
                    } else {
                      const errText = await imagenRes.text();
                      console.error(`  [AI Generation] Fallback ${modelName} failed with status ${imagenRes.status}:`, errText);
                    }
                  } catch (err: any) {
                    console.error(`  [AI Generation] Fallback ${modelName} exception:`, err.message || err);
                  }
                }
              }

              if (apiSuccess && modelGeneratedBytes) {
                let finalImageBuffer = Buffer.from(modelGeneratedBytes, "base64");
                if (generatedByGemini) {
                  finalImageBuffer = Buffer.from(
                    await sharp(finalImageBuffer)
                      .resize({ width: 1800 })
                      .sharpen(1.0, 1.0, 1.0)
                      .toBuffer()
                  );
                }
                fs.writeFileSync(finalLocalPath, finalImageBuffer);
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                console.error(`  ❌ [AI Generation] All generation attempts failed for pose: ${poseConfig.pose}. Saree will be uploaded without model try-on photos.`);
              }
            }
          }
        }

        // 6. Data Cleaning & Text Formatting
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

        // Upload images to Shopify
        const files = fs.readdirSync(itemMediaDir);
        let imageFiles = files.filter(f => [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(path.extname(f).toLowerCase()));
        
        imageFiles.sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aModel = aLower.match(/model(\d+)/);
          const bModel = bLower.match(/model(\d+)/);
          if (aModel && bModel) return parseInt(aModel[1], 10) - parseInt(bModel[1], 10);
          else if (aModel) return -1;
          else if (bModel) return 1;
          return aLower.localeCompare(bLower);
        });

        const uploadedImages: Array<{ id: string; url: string }> = [];
        const heicConvert = require("heic-convert");

        for (const file of imageFiles) {
          const localPath = path.join(itemMediaDir, file);
          let fileBuffer = fs.readFileSync(localPath);
          const ext = path.extname(file).toLowerCase();

          if (ext === ".heic" || ext === ".heif") {
            try {
              const converted = await heicConvert({ buffer: fileBuffer, format: "JPEG", quality: 0.9 });
              fileBuffer = Buffer.from(converted);
            } catch (err) {}
          }

          const optimizedBuffer = await sharp(fileBuffer)
            .resize(2400, undefined, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 88, progressive: true })
            .toBuffer();

          const mimeType = "image/jpeg";
          const uploadName = `${sku}_${path.basename(file, path.extname(file)).replace(/\.(heic|heif)$/i, "")}.jpg`;

          let uploadResult = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              uploadResult = await shopifySaree.uploadMedia(uploadName, mimeType, optimizedBuffer);
              break;
            } catch (err) {
              await new Promise(r => setTimeout(r, 1500));
            }
          }

          if (uploadResult) {
            uploadedImages.push(uploadResult);
            reportItem.images.push(uploadResult.url);
          }
        }

        reportItem.imagesCount = uploadedImages.length;

        // Create Shopify listing
        const payload = {
          title: cleanTitle,
          handle: "",
          descriptionHtml: `<p>${sareeDescription.replace(/\n/g, "<br />")}</p>`,
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

        await db.set("google-sync:progress", { 
          step: 5, 
          text: `Publishing Saree ${serialNum} to Shopify`, 
          status: "active", 
          log: `Uploading optimized images to Shopify Files CDN and creating listing for SKU ${sku}...` 
        });

        const createdProduct = await shopifySaree.create(payload);

        // Redis save
        const margin = reportItem.price > 0 ? (reportItem.price - reportItem.costPrice) / reportItem.price : 0;
        await sareeDb.set(sku, {
          costPrice: reportItem.costPrice,
          margin,
          privateNotes: item['privatenotes'] || ''
        });

        reportItem.status = "success";
        reportItem.shopifyId = createdProduct.id;

        // 7. Write Back to Google Sheet using Google Apps Script Web App
        const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
        if (scriptUrl) {
          console.log(`  Writing updates back to Google Sheet via Apps Script for serial ${serialNum}...`);
          try {
            const writebackRes = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                serialNumber: serialNum,
                sku: sku,
                title: cleanTitle,
                description: sareeDescription,
                weave: cleanWeave,
                colors: cleanColors,
                uploaded: "Y"
              })
            });
            if (writebackRes.ok) {
              console.log(`  ✓ Successfully wrote updates to Sheet for serial ${serialNum}.`);
            } else {
              console.warn(`  ⚠️ Sheet writeback returned status: ${writebackRes.status}`);
            }
          } catch (writebackErr: any) {
            console.error(`  ⚠️ Failed to write back to Sheet:`, writebackErr.message || writebackErr);
          }
        } else {
          console.log(`  [Sheet Writeback] GOOGLE_SCRIPT_URL not configured. Skipping.`);
        }

      } catch (err: any) {
        console.error(`[Google Sync API] Error for saree SKU ${sku}:`, err.message || err);
        reportItem.status = "failed";
        reportItem.error = err.message || String(err);
      }

      report.push(reportItem);
    }

    const reportPath = path.resolve(process.cwd(), "public/bulk-upload-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

    await db.set("google-sync:progress", { step: 5, text: "Direct Sync Completed Successfully", status: "completed", log: `Successfully processed ${report.filter(r => r.status === "success").length} sarees.` });

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    console.error("Google Sync API fail:", err);
    await db.set("google-sync:progress", { step: 5, text: "Sync Failed", status: "failed", log: err.message || String(err) });
    return NextResponse.json({ error: err.message || "Google Sync failed" }, { status: 500 });
  }
}
