import fs from "fs";
import path from "path";

// 1. Load env variables manually from .env.local BEFORE imports
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

// Helper to stringify CSV back
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

async function main() {
  const { shopifyAdminFetch, shopifySaree } = await import("../src/lib/shopify");
  const targetSerials = ["13", "14", "16", "17", "21", "24", "35"];

  console.log("Updating local CSV files...");

  // A. Process inventory_cleaned.csv
  const cleanedCsvPath = path.resolve(process.cwd(), "data/inventory_cleaned.csv");
  if (fs.existsSync(cleanedCsvPath)) {
    const csvContent = fs.readFileSync(cleanedCsvPath, "utf-8");
    const allRows = parseCSV(csvContent);
    const headers = allRows[0];
    const serialIdx = headers.findIndex(h => h.trim().toLowerCase() === "serial number");
    const exclusiveIdx = headers.findIndex(h => h.trim().toLowerCase().startsWith("founders exclusive"));
    const tagsIdx = headers.findIndex(h => h.trim().toLowerCase().startsWith("tags"));

    if (serialIdx >= 0 && exclusiveIdx >= 0 && tagsIdx >= 0) {
      for (let i = 2; i < allRows.length; i++) {
        const row = allRows[i];
        const serial = row[serialIdx];
        if (targetSerials.includes(serial)) {
          row[exclusiveIdx] = "TRUE";
          const currentTags = row[tagsIdx] ? row[tagsIdx].split(",").map(t => t.trim()).filter(Boolean) : [];
          if (!currentTags.includes("Founders-Exclusive")) {
            currentTags.push("Founders-Exclusive");
          }
          row[tagsIdx] = currentTags.join(", ");
        }
      }
      fs.writeFileSync(cleanedCsvPath, stringifyCSV(allRows), "utf-8");
      console.log("✓ Updated inventory_cleaned.csv successfully.");
    }
  }

  // B. Process inventory - inventory.csv.csv
  const mainCsvPath = path.resolve(process.cwd(), "data/inventory - inventory.csv.csv");
  if (fs.existsSync(mainCsvPath)) {
    const csvContent = fs.readFileSync(mainCsvPath, "utf-8");
    const allRows = parseCSV(csvContent);
    const headers = allRows[0];
    const serialIdx = headers.findIndex(h => h.trim().toLowerCase() === "serial number");
    const exclusiveIdx = headers.findIndex(h => h.trim().toLowerCase().startsWith("founders exclusive"));
    const tagsIdx = headers.findIndex(h => h.trim().toLowerCase().startsWith("tags"));

    if (serialIdx >= 0 && exclusiveIdx >= 0 && tagsIdx >= 0) {
      for (let i = 2; i < allRows.length; i++) {
        const row = allRows[i];
        const serial = row[serialIdx];
        if (targetSerials.includes(serial)) {
          row[exclusiveIdx] = "TRUE";
          const currentTags = row[tagsIdx] ? row[tagsIdx].split(",").map(t => t.trim()).filter(Boolean) : [];
          if (!currentTags.includes("Founders-Exclusive")) {
            currentTags.push("Founders-Exclusive");
          }
          row[tagsIdx] = currentTags.join(", ");
        }
      }
      fs.writeFileSync(mainCsvPath, stringifyCSV(allRows), "utf-8");
      console.log("✓ Updated inventory - inventory.csv.csv successfully.");
    }
  }

  console.log("\nStarting Shopify Sync & Media Uploads...");

  for (const serial of targetSerials) {
    const sku = `RP-SAREE-${serial}`;
    console.log(`\n⏳ Processing ${sku}...`);

    // 1. Locate the video file
    const mediaDir = path.resolve(process.cwd(), `data/inventory/${serial}`);
    if (!fs.existsSync(mediaDir)) {
      console.warn(`⚠️ Media directory not found for Serial ${serial}`);
      continue;
    }

    const files = fs.readdirSync(mediaDir);
    const videoFile = files.find(f => {
      const ext = path.extname(f).toLowerCase();
      return [".mp4", ".mov"].includes(ext);
    });

    if (!videoFile) {
      console.warn(`⚠️ No video file found under data/inventory/${serial}`);
      continue;
    }

    const videoPath = path.join(mediaDir, videoFile);
    console.log(`  Found video file: ${videoFile}`);

    // 2. Fetch the corresponding Shopify Product
    const searchRes = await shopifyAdminFetch<any>({
      query: `
        query getProductBySku($query: String!) {
          products(first: 1, query: $query) {
            edges {
              node {
                id
                title
                tags
              }
            }
          }
        }
      `,
      variables: { query: `sku:${sku}` }
    });

    const edges = searchRes.products?.edges || [];
    if (edges.length === 0) {
      console.error(`❌ Product with SKU ${sku} not found on Shopify. Skip.`);
      continue;
    }

    const productId = edges[0].node.id;
    const existingTags = edges[0].node.tags || [];
    console.log(`  Found Shopify Product "${edges[0].node.title}" with ID: ${productId}`);

    // 3. Upload the Video to Shopify
    console.log(`  Uploading video to Shopify...`);
    const fileBuffer = fs.readFileSync(videoPath);
    const ext = path.extname(videoFile).toLowerCase();
    const mimeType = ext === ".mov" ? "video/quicktime" : "video/mp4";
    const uploadName = `${sku}_short_video${ext}`;

    const uploadResult = await shopifySaree.uploadMedia(uploadName, mimeType, fileBuffer);
    console.log(`  ✓ Video uploaded successfully. ID: ${uploadResult.id}`);

    // 4. Update the Product Metafields and Tags
    const updatedTags = Array.from(new Set([...existingTags, "Founders-Exclusive"]));

    console.log(`  Updating product metadata on Shopify...`);
    const updateRes = await shopifyAdminFetch<any>({
      query: `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
            }
            userErrors {
              message
            }
          }
        }
      `,
      variables: {
        input: {
          id: productId,
          tags: updatedTags,
          metafields: [
            {
              namespace: "saree",
              key: "short_video",
              value: uploadResult.id,
              type: "file_reference"
            },
            {
              namespace: "saree",
              key: "founders_exclusive",
              value: "true",
              type: "single_line_text_field"
            }
          ]
        }
      }
    });

    if (updateRes.productUpdate?.userErrors?.length) {
      console.error(`  ❌ Update failed:`, updateRes.productUpdate.userErrors);
    } else {
      console.log(`  ✓ Successfully linked video and marked as Founders-Exclusive.`);
      
      // Ensure Smart collections are refreshed
      await shopifySaree.addProductToCollections(productId, updatedTags);
    }
  }

  console.log("\n🎉 Sync and video upload process completed successfully!");
}

main().catch(err => {
  console.error("Error executing script:", err);
  process.exit(1);
});
