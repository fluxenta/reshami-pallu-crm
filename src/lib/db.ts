import { Redis } from "@upstash/redis";

// Check that environment variables exist
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || "https://placeholder-url.upstash.io";
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "placeholder-token";

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.warn("[DB] Warning: Missing Upstash Redis environment variables. Using placeholder values.");
}

export const db = new Redis({
  url: redisUrl,
  token: redisToken,
});

/**
 * Type-safe helpers to store saree cost, margins, and notes
 */
export interface SareeMetadata {
  costPrice: number;
  margin: number;
  privateNotes?: string;
  updatedAt: string;
}

export const sareeDb = {
  // Get private cost price data for a specific SKU
  async get(sku: string): Promise<SareeMetadata | null> {
    try {
      return await db.get<SareeMetadata>(`saree:meta:${sku}`);
    } catch (err) {
      console.error(`Redis Error fetching metadata for SKU ${sku}:`, err);
      return null;
    }
  },

  // Save private cost price data
  async set(sku: string, data: Omit<SareeMetadata, "updatedAt">): Promise<boolean> {
    try {
      const payload: SareeMetadata = {
        ...data,
        updatedAt: new Date().toISOString(),
      };
      await db.set(`saree:meta:${sku}`, payload);
      return true;
    } catch (err) {
      console.error(`Redis Error saving metadata for SKU ${sku}:`, err);
      return false;
    }
  },

  // Delete metadata when product is deleted
  async delete(sku: string): Promise<boolean> {
    try {
      await db.del(`saree:meta:${sku}`);
      return true;
    } catch (err) {
      console.error(`Redis Error deleting metadata for SKU ${sku}:`, err);
      return false;
    }
  },

  // Batch get metadata for multiple SKUs to avoid N+1 queries
  async mget(skus: string[]): Promise<Record<string, SareeMetadata>> {
    if (skus.length === 0) return {};
    try {
      const keys = skus.map(sku => `saree:meta:${sku}`);
      const results = await db.mget<SareeMetadata[]>(...keys);
      
      const map: Record<string, SareeMetadata> = {};
      skus.forEach((sku, idx) => {
        if (results[idx]) {
          map[sku] = results[idx];
        }
      });
      return map;
    } catch (err) {
      console.error("Redis Error during batch metadata fetch:", err);
      return {};
    }
  }
};
