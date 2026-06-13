import fs from "fs";
import path from "path";

// Manually load environment variables from .env.local
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

import { shopifyCollection } from "../src/lib/shopify";
import { shopifyAdminFetch } from "../src/lib/shopify";

async function publishCollections() {
  console.log("Fetching publications...");
  const pubQuery = `
    query {
      publications(first: 10) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  const pubRes = await shopifyAdminFetch<{ publications: { edges: Array<{ node: { id: string, name: string } }> } }>({ query: pubQuery });
  
  let targetPubId: string | null = null;
  for (const edge of pubRes.publications.edges) {
    console.log(`Found Publication: ${edge.node.name} (${edge.node.id})`);
    // Storefront app is typically named "Headless", "Storefront", or similar. Let's just publish to ALL of them to be safe, or just find Headless.
    if (edge.node.name.toLowerCase().includes("headless") || edge.node.name.toLowerCase().includes("online")) {
      targetPubId = edge.node.id;
    }
  }

  // Get all collections
  const collections = await shopifyCollection.list(250);
  const autoColls = collections.filter(c => c.title.includes("[Auto]"));
  console.log(`Found ${autoColls.length} [Auto] collections.`);

  if (autoColls.length === 0) {
    console.log("No [Auto] collections found.");
    return;
  }

  const publishMutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors {
          message
        }
      }
    }
  `;

  // We will publish each collection to ALL publications to ensure it's visible.
  for (const coll of autoColls) {
    console.log(`Publishing collection ${coll.title} (${coll.id})...`);
    for (const pub of pubRes.publications.edges) {
      const pubInput = [{ publicationId: pub.node.id }];
      const res = await shopifyAdminFetch<{ publishablePublish: { userErrors: Array<any> } }>({
        query: publishMutation,
        variables: { id: coll.id, input: pubInput }
      });
      if (res.publishablePublish?.userErrors?.length) {
        console.error(`  Failed to publish to ${pub.node.name}:`, res.publishablePublish.userErrors[0].message);
      } else {
        console.log(`  Successfully published to ${pub.node.name}`);
      }
    }
  }
}

publishCollections().catch(console.error);
