import fs from "fs";
import path from "path";

// 1. Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  for (const line of envConfig.split("\n")) {
    const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (matched) {
      const key = matched[1];
      let value = (matched[2] || "").trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

import { shopifyAdminFetch, shopifyCollection } from "../src/lib/shopify";

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

const toTitleCase = (str: string) => {
  if (!str) return "";
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

const cleanFieldList = (val: string): string[] => {
  if (!val || val.toLowerCase() === 'nil') return [];
  const items = val.split(/[,;\/&]|\band\b/i)
    .map(item => item.trim())
    .filter(item => item && item.toLowerCase() !== 'nil')
    .map(item => toTitleCase(item));
  return Array.from(new Set(items));
};

async function syncCollectionsFromCSV() {
  console.log("🔄 Starting Shopify Automated Collections Sync from CSV data...");

  // 1. Read cleaned CSV
  const csvPath = path.resolve(process.cwd(), "data/inventory_cleaned.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Cleaned CSV not found at: ${csvPath}`);
    process.exit(1);
  }
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const allRows = parseCSV(csvContent);
  const headers = allRows[0];
  const dataRows = allRows.slice(2); // Skip instructions row

  const normalizeKey = (key: string) => {
    return key.replace(/\([^)]*\)/g, '').trim().toLowerCase().replace(/[\s_-]/g, '');
  };

  const productMappings: Array<{
    sku: string;
    fabrics: string[];
    occasions: string[];
  }> = [];

  const uniqueFabrics = new Set<string>();
  const uniqueOccasions = new Set<string>();

  for (const row of dataRows) {
    const item: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const normKey = normalizeKey(h);
      item[normKey] = row[idx] || '';
    });

    const sku = item['sku'];
    if (!sku) continue;

    const fabrics = cleanFieldList(item['fabric']);
    const occasions = cleanFieldList(item['occasion'] || item['occasioncommaseperated']);

    fabrics.forEach(f => uniqueFabrics.add(f));
    occasions.forEach(o => uniqueOccasions.add(o));

    productMappings.push({ sku, fabrics, occasions });
  }

  console.log(`Parsed ${productMappings.length} products from CSV.`);
  console.log(`Unique fabrics from CSV (${uniqueFabrics.size}):`, Array.from(uniqueFabrics));
  console.log(`Unique occasions from CSV (${uniqueOccasions.size}):`, Array.from(uniqueOccasions));

  // 2. Fetch all products from Shopify to map SKU to Product ID
  const productsQuery = `
    query getProducts {
      products(first: 250, query: "vendor:'Reshami Pallu'") {
        edges {
          node {
            id
            title
            variants(first: 1) {
              edges {
                node {
                  sku
                }
              }
            }
          }
        }
      }
    }
  `;

  const productsRes = await shopifyAdminFetch<any>({ query: productsQuery });
  const shopifyProducts = productsRes.products?.edges?.map((e: any) => e.node) || [];
  
  const skuToProductIdMap = new Map<string, string>();
  shopifyProducts.forEach((p: any) => {
    const sku = p.variants?.edges?.[0]?.node?.sku;
    if (sku) {
      skuToProductIdMap.set(sku, p.id);
    }
  });

  // 3. Fetch all current collections from Shopify
  const collectionsQuery = `
    query getCollections {
      collections(first: 250) {
        edges {
          node {
            id
            title
            handle
            products(first: 250) {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    }
  `;

  const collectionsRes = await shopifyAdminFetch<any>({ query: collectionsQuery });
  const allShopifyCollections = collectionsRes.collections?.edges?.map((e: any) => e.node) || [];

  // 4. Identify target collections we need to exist
  const targetCollections = new Map<string, { type: "Fabric" | "Occasion"; value: string; skus: string[] }>();
  
  uniqueFabrics.forEach(fabric => {
    const title = `[Auto] Fabric: ${fabric}`;
    const skus = productMappings.filter(pm => pm.fabrics.includes(fabric)).map(pm => pm.sku);
    targetCollections.set(title, { type: "Fabric", value: fabric, skus });
  });

  uniqueOccasions.forEach(occasion => {
    const title = `[Auto] Occasion: ${occasion}`;
    const skus = productMappings.filter(pm => pm.occasions.includes(occasion)).map(pm => pm.sku);
    targetCollections.set(title, { type: "Occasion", value: occasion, skus });
  });

  // 5. Delete obsolete [Auto] collections (no longer present in CSV)
  const autoCollectionsToDelete = allShopifyCollections.filter((c: any) => {
    return c.title.startsWith("[Auto]") && !targetCollections.has(c.title);
  });

  if (autoCollectionsToDelete.length > 0) {
    console.log(`\n🗑️ Deleting ${autoCollectionsToDelete.length} obsolete [Auto] collections...`);
    for (const c of autoCollectionsToDelete) {
      console.log(`  Deleting collection: "${c.title}" (${c.id})...`);
      const success = await shopifyCollection.delete(c.id);
      if (success) {
        console.log(`  ✓ Deleted successfully.`);
      } else {
        console.error(`  ❌ Failed to delete.`);
      }
    }
  }

  // 6. Ensure target collections exist, update their products
  const collectionCreateMutation = `
    mutation collectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection {
          id
          title
        }
        userErrors {
          message
        }
      }
    }
  `;

  const collectionAddProductsMutation = `
    mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        userErrors {
          message
        }
      }
    }
  `;

  const collectionRemoveProductsMutation = `
    mutation collectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $productIds) {
        userErrors {
          message
        }
      }
    }
  `;

  for (const [title, details] of targetCollections.entries()) {
    // Check if collection already exists
    let collection = allShopifyCollections.find((c: any) => c.title === title);
    
    if (!collection) {
      console.log(`\n➕ Creating target manual collection: "${title}"...`);
      const res = await shopifyAdminFetch<any>({
        query: collectionCreateMutation,
        variables: {
          input: { title, handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") }
        }
      });
      if (res.collectionCreate?.userErrors?.length > 0) {
        console.error(`  ❌ Failed to create collection "${title}":`, res.collectionCreate.userErrors[0].message);
        continue;
      }
      collection = res.collectionCreate.collection;
      collection.products = { edges: [] }; // start empty
    } else {
      console.log(`\n⏳ Updating collection: "${title}"...`);
    }

    // Determine matching product IDs using the mapped CSV SKU list
    const targetProductIds = details.skus
      .map(sku => skuToProductIdMap.get(sku))
      .filter(Boolean) as string[];

    const currentProductIds = collection.products?.edges?.map((e: any) => e.node.id) || [];

    const toAdd = targetProductIds.filter(id => !currentProductIds.includes(id));
    const toRemove = currentProductIds.filter(id => !targetProductIds.includes(id));

    console.log(`  Target products based on CSV: ${details.skus.join(", ")}`);
    console.log(`  Matching Shopify IDs count: ${targetProductIds.length}`);

    if (toAdd.length > 0) {
      console.log(`  ➕ Adding ${toAdd.length} products...`);
      const res = await shopifyAdminFetch<any>({
        query: collectionAddProductsMutation,
        variables: { id: collection.id, productIds: toAdd }
      });
      if (res.collectionAddProducts?.userErrors?.length > 0) {
        console.error(`  ❌ Failed to add products:`, res.collectionAddProducts.userErrors[0].message);
      } else {
        console.log(`  ✓ Added products successfully.`);
      }
    }

    if (toRemove.length > 0) {
      console.log(`  ➖ Removing ${toRemove.length} products...`);
      const res = await shopifyAdminFetch<any>({
        query: collectionRemoveProductsMutation,
        variables: { id: collection.id, productIds: toRemove }
      });
      if (res.collectionRemoveProducts?.userErrors?.length > 0) {
        console.error(`  ❌ Failed to remove products:`, res.collectionRemoveProducts.userErrors[0].message);
      } else {
        console.log(`  ✓ Removed products successfully.`);
      }
    }

    if (toAdd.length === 0 && toRemove.length === 0) {
      console.log(`  ✓ Collection is already in sync with CSV.`);
    }
  }

  console.log("\n🎉 Automated Collections Sync from CSV finished successfully!");
}

syncCollectionsFromCSV().catch(console.error);
