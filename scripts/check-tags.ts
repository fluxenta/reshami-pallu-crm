import fs from "fs";
import path from "path";

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
  const { shopifySaree } = await import("../src/lib/shopify");
  const { products } = await shopifySaree.list(150);
  console.log("Found products on Shopify:", products.length);
  products.forEach(p => {
    console.log(`- ${p.title} (${p.sku})`);
    console.log(`  Tags:`, p.tags);
    console.log(`  Metafields:`, {
      fabric: p.metafields.fabric,
      weave: p.metafields.weave,
      colorFamily: p.metafields.colorFamily,
      occasion: p.metafields.occasion,
    });
  });
}

main().catch(console.error);
