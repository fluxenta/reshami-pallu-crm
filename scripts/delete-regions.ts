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

async function main() {
  console.log("Starting Region deletion cleanup...");

  // Dynamically import db and shopify helper AFTER environment variables are populated
  const { db } = await import("../src/lib/db");
  const { shopifyAdminFetch } = await import("../src/lib/shopify");

  // A. Clean up Upstash Redis Options cache
  try {
    console.log("Clearing options:regions key in Redis...");
    const count = await db.del("options:regions");
    console.log(`Deleted ${count} key(s) from Redis.`);
  } catch (err) {
    console.error("Failed to delete options:regions in Redis:", err);
  }

  // B. Clean up Shopify Saree Region Metafield Definition
  try {
    console.log("Querying metafield definitions on Shopify...");
    const queryDefinitions = `
      query {
        metafieldDefinitions(first: 50, ownerType: PRODUCT) {
          edges {
            node {
              id
              namespace
              key
            }
          }
        }
      }
    `;
    const res = await shopifyAdminFetch<{ metafieldDefinitions: { edges: Array<{ node: { id: string; namespace: string; key: string } }> } }>({
      query: queryDefinitions
    });

    const definitions = res.metafieldDefinitions.edges;
    const regionDef = definitions.find(d => d.node.namespace === "saree" && d.node.key === "region");

    if (regionDef) {
      console.log(`Found saree.region metafield definition with ID: ${regionDef.node.id}. Deleting...`);
      const deleteMutation = `
        mutation deleteMetafieldDefinition($id: ID!) {
          metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: true) {
            deletedDefinitionId
            userErrors {
              field
              message
            }
          }
        }
      `;
      const deleteRes = await shopifyAdminFetch<{ metafieldDefinitionDelete: { deletedDefinitionId?: string; userErrors: Array<{ message: string }> } }>({
        query: deleteMutation,
        variables: { id: regionDef.node.id }
      });

      if (deleteRes.metafieldDefinitionDelete.userErrors?.length) {
        console.error("Shopify errors deleting metafield definition:", deleteRes.metafieldDefinitionDelete.userErrors);
      } else {
        console.log(`Successfully deleted metafield definition: ${deleteRes.metafieldDefinitionDelete.deletedDefinitionId}`);
      }
    } else {
      console.log("No saree.region metafield definition found on Shopify.");
    }
  } catch (err) {
    console.error("Failed to delete Shopify metafield definition:", err);
  }

  console.log("Region cleanup completed.");
}

main().catch(err => {
  console.error("Error running cleanup script:", err);
  process.exit(1);
});
