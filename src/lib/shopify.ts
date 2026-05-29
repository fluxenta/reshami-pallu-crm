import crypto from "crypto";
const domain = process.env.SHOPIFY_STORE_DOMAIN || 'reshmi-pallu.myshopify.com';
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

let cachedToken: string | null = null;
let tokenExpiryTime = 0;

async function getAdminToken(): Promise<string> {
  const now = Date.now();
  // If we have a cached token and it hasn't expired yet (with a 5-minute safety buffer)
  if (cachedToken && tokenExpiryTime > now + 300000) {
    return cachedToken;
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (clientId && clientSecret) {
    try {
      console.log("[Shopify Admin] Requesting fresh access token...");
      const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch access token: ${res.status} ${text}`);
      }

      const data = await res.json();
      if (data.access_token) {
        cachedToken = data.access_token;
        const expiresIn = data.expires_in || 86390;
        tokenExpiryTime = now + expiresIn * 1000;
        console.log("[Shopify Admin] Token refreshed successfully.");
        return cachedToken!;
      }
    } catch (err) {
      console.error("[Shopify Admin] Failed to refresh token, falling back to static env token:", err);
    }
  }

  // Fallback to static env token
  return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";
}

const endpoint = `https://${domain}/admin/api/${apiVersion}/graphql.json`;

interface AdminResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function shopifyAdminFetch<T>({
  query,
  variables = {},
  cache = 'no-store'
}: {
  query: string;
  variables?: Record<string, unknown>;
  cache?: RequestCache;
}): Promise<T> {
  const activeToken = await getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': activeToken,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      cache
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Shopify Admin API error ${response.status}: ${errText}`);
    }

    const json: AdminResponse<T> = await response.json();

    if (json.errors?.length) {
      throw new Error(`Shopify Admin GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`);
    }

    return json.data as T;
  } catch (error: any) {
    console.error("Shopify Admin Fetch Failure:", error);
    throw error;
  }
}

/**
 * Types representing Saree Product structure in CRM
 */
export interface SareeProduct {
  id: string;
  title: string;
  descriptionHtml: string;
  handle: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  tags: string[];
  imageUrl?: string;
  images?: Array<{ id: string; url: string }>;
  sku: string;
  createdAt?: string;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  locationId?: string;
  inventoryItemId?: string;
  metafields: {
    fabric?: string;
    weave?: string;
    colorFamily?: string;
    occasion?: string;
    region?: string;
    blouseIncluded?: boolean;
    blouseLength?: string;
    washCare?: string;
    sareeLength?: string;
    shortVideo?: {
      id: string;
      url: string;
    };
    foundersExclusive?: boolean;
  };
}

/**
 * GraphQL fragments to ensure all queries are fully synced
 */
const PRODUCT_FRAGMENT = `
  fragment ProductDetails on Product {
    id
    title
    createdAt
    descriptionHtml
    handle
    status
    tags
    featuredImage {
      url
    }
    media(first: 20) {
      edges {
        node {
          ... on MediaImage {
            id
            image {
              url
            }
          }
        }
      }
    }
    variants(first: 1) {
      edges {
        node {
          id
          sku
          price
          compareAtPrice
          inventoryItem {
            id
            inventoryLevels(first: 1) {
              edges {
                node {
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                  location {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
    fabric: metafield(namespace: "saree", key: "fabric") { value }
    weave: metafield(namespace: "saree", key: "weave") { value }
    colorFamily: metafield(namespace: "saree", key: "color_family") { value }
    occasion: metafield(namespace: "saree", key: "occasion") { value }
    region: metafield(namespace: "saree", key: "region") { value }
    blouseIncluded: metafield(namespace: "saree", key: "blouse_included") { value }
    blouseLength: metafield(namespace: "saree", key: "blouse_length") { value }
    washCareV2: metafield(namespace: "saree", key: "wash_care_v2") { value }
    washCareLegacy: metafield(namespace: "saree", key: "wash_care") { value }
    sareeLength: metafield(namespace: "saree", key: "saree_length") { value }
    shortVideo: metafield(namespace: "saree", key: "short_video") {
      value
      reference {
        ... on Video {
          id
          sources {
            url
            mimeType
          }
        }
      }
    }
    foundersExclusive: metafield(namespace: "saree", key: "founders_exclusive") { value }
  }
`;

function mapShopifyProduct(node: any): SareeProduct {
  const variantEdge = node.variants?.edges?.[0]?.node;
  const invLevelEdge = variantEdge?.inventoryItem?.inventoryLevels?.edges?.[0]?.node;
  const availableQty = invLevelEdge?.quantities?.find((q: any) => q.name === "available")?.quantity || 0;

  // Extract short video
  let shortVideoData;
  if (node.shortVideo?.reference) {
    const videoSource = node.shortVideo.reference.sources?.find((s: any) => s.mimeType === "video/mp4") || node.shortVideo.reference.sources?.[0];
    shortVideoData = {
      id: node.shortVideo.reference.id,
      url: videoSource?.url || ""
    };
  }

  // Extract Images
  const mediaEdges = node.media?.edges || [];
  const images = mediaEdges
    .filter((e: any) => e.node.image?.url)
    .map((e: any) => ({
      id: e.node.id,
      url: e.node.image.url
    }));

  return {
    id: node.id,
    title: node.title,
    descriptionHtml: node.descriptionHtml || '',
    handle: node.handle,
    status: node.status,
    tags: node.tags || [],
    imageUrl: node.featuredImage?.url,
    images,
    sku: variantEdge?.sku || '',
    price: parseFloat(variantEdge?.price || '0'),
    compareAtPrice: variantEdge?.compareAtPrice ? parseFloat(variantEdge.compareAtPrice) : null,
    stock: availableQty,
    locationId: invLevelEdge?.location?.id,
    inventoryItemId: variantEdge?.inventoryItem?.id,
    createdAt: node.createdAt,
    metafields: {
      fabric: node.fabric?.value,
      weave: node.weave?.value,
      colorFamily: node.colorFamily?.value,
      occasion: node.occasion?.value,
      region: node.region?.value,
      blouseIncluded: node.blouseIncluded?.value === 'true',
      blouseLength: node.blouseLength?.value,
      washCare: node.washCareV2?.value || node.washCareLegacy?.value,
      sareeLength: node.sareeLength?.value,
      shortVideo: shortVideoData,
      foundersExclusive: node.foundersExclusive?.value === 'true',
    }
  };
}

export const shopifySaree = {
  // Fetch active and draft products (Sarees)
  async list(limit = 50, cursor: string | null = null): Promise<{ products: SareeProduct[], nextCursor: string | null }> {
    const query = `
      ${PRODUCT_FRAGMENT}
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after, query: "vendor:'Reshami Pallu'") {
          edges {
            cursor
            node {
              ...ProductDetails
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const data = await shopifyAdminFetch<{ products: { edges: Array<{ cursor: string, node: any }>, pageInfo: { hasNextPage: boolean } } }>({
      query,
      variables: { first: limit, after: cursor }
    });

    const edges = data.products.edges;
    const products = edges.map(edge => mapShopifyProduct(edge.node));
    const nextCursor = data.products.pageInfo.hasNextPage ? edges[edges.length - 1].cursor : null;

    return { products, nextCursor };
  },

  // Get a single product details
  async get(id: string): Promise<SareeProduct | null> {
    const query = `
      ${PRODUCT_FRAGMENT}
      query getProduct($id: ID!) {
        product(id: $id) {
          ...ProductDetails
        }
      }
    `;

    try {
      const data = await shopifyAdminFetch<{ product: any }>({
        query,
        variables: { id }
      });
      return data.product ? mapShopifyProduct(data.product) : null;
    } catch {
      return null;
    }
  },

  // Create a new Saree in Shopify
  async create(saree: Omit<SareeProduct, 'id' | 'imageUrl' | 'locationId' | 'inventoryItemId'>): Promise<SareeProduct> {
    const mutation = `
      ${PRODUCT_FRAGMENT}
      mutation productCreateWithMetafields($input: ProductInput!, $media: [CreateMediaInput!]) {
        productCreate(input: $input, media: $media) {
          product {
            ...ProductDetails
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Map input fields to Shopify parameters
    const metafields = [
      { namespace: "saree", key: "fabric", value: saree.metafields.fabric || '', type: "single_line_text_field" },
      { namespace: "saree", key: "weave", value: saree.metafields.weave || '', type: "single_line_text_field" },
      { namespace: "saree", key: "color_family", value: saree.metafields.colorFamily || '', type: "single_line_text_field" },
      { namespace: "saree", key: "occasion", value: saree.metafields.occasion || '', type: "single_line_text_field" },
      { namespace: "saree", key: "region", value: saree.metafields.region || '', type: "single_line_text_field" },
      { namespace: "saree", key: "blouse_included", value: saree.metafields.blouseIncluded ? 'true' : 'false', type: "single_line_text_field" },
      { namespace: "saree", key: "blouse_length", value: saree.metafields.blouseLength || '', type: "single_line_text_field" },
      { namespace: "saree", key: "wash_care_v2", value: saree.metafields.washCare || '', type: "multi_line_text_field" },
      { namespace: "saree", key: "saree_length", value: saree.metafields.sareeLength || '6.0', type: "single_line_text_field" },
      { namespace: "saree", key: "founders_exclusive", value: saree.metafields.foundersExclusive ? 'true' : 'false', type: "single_line_text_field" },
    ].filter(m => m.value !== '');

    // Add short video if a file reference exists
    if (saree.metafields.shortVideo?.id) {
      metafields.push({
        namespace: "saree",
        key: "short_video",
        value: saree.metafields.shortVideo.id,
        type: "file_reference"
      });
    }

    // Standard product tags
    const tags = [...saree.tags];
    if (saree.metafields.foundersExclusive && !tags.includes('Founders-Exclusive')) {
      tags.push('Founders-Exclusive');
    }

    // Prepare media array if shortVideo media ID is available
    const media = [];
    if (saree.metafields.shortVideo?.id && saree.metafields.shortVideo?.url) {
      // For Shopify media creation, use the uploaded media URL as originalSource
      media.push({ originalSource: saree.metafields.shortVideo.url, mediaContentType: "VIDEO" });
    }

    if ((saree as any).images && Array.isArray((saree as any).images)) {
      for (const img of (saree as any).images) {
        if (img.url) {
          media.push({ originalSource: img.url, mediaContentType: "IMAGE" });
        }
      }
    }

    const variables = {
      input: {
        title: saree.title,
        descriptionHtml: saree.descriptionHtml,
        vendor: "Reshami Pallu",
        status: "ACTIVE",
        tags,
        metafields
      },
      media
    };

    const res = await shopifyAdminFetch<{ productCreate: { product: any, userErrors: Array<{ message: string }> } }>({
      query: mutation,
      variables
    });

    if (res.productCreate.userErrors.length > 0) {
      throw new Error(`Shopify Saree creation failed: ${res.productCreate.userErrors[0].message}`);
    }

    const createdProductDetails = res.productCreate.product;
    const defaultVariantId = createdProductDetails.variants.edges[0]?.node.id;

    // Ensure product appears in the "All Sarees" collection and tag‑based smart collections
    await this.ensureAllSareesCollection();
    await this.addProductToCollections(createdProductDetails.id, tags);
    await this.ensurePublished(createdProductDetails.id);

    // Note: Shopify automatically sets the first media image uploaded as the featured image.
    // The previous featuredImageId mutation is unsupported by Shopify's modern ProductInput object.

    if (defaultVariantId) {
      const variantMutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variantRes = await shopifyAdminFetch<{ productVariantsBulkUpdate: { productVariants: any[], userErrors: Array<{ message: string }> } }>({
        query: variantMutation,
        variables: {
          productId: createdProductDetails.id,
          variants: [
            {
              id: defaultVariantId,
              price: saree.price.toString(),
              compareAtPrice: saree.compareAtPrice ? saree.compareAtPrice.toString() : null,
              inventoryPolicy: "DENY",
              inventoryItem: {
                sku: saree.sku,
                tracked: true
              }
            }
          ]
        }
      });

      if (variantRes.productVariantsBulkUpdate.userErrors.length > 0) {
        throw new Error(`Default variant update failed: ${variantRes.productVariantsBulkUpdate.userErrors[0].message}`);
      }

      // Update in-memory references so mapShopifyProduct works perfectly
      if (createdProductDetails.variants.edges[0]?.node) {
        createdProductDetails.variants.edges[0].node.price = saree.price.toString();
        createdProductDetails.variants.edges[0].node.compareAtPrice = saree.compareAtPrice ? saree.compareAtPrice.toString() : null;
        createdProductDetails.variants.edges[0].node.sku = saree.sku;
      }
    }

    const createdProduct = mapShopifyProduct(createdProductDetails);

    // Set stock quantity if defined and > 0
    if (saree.stock > 0 && createdProduct.inventoryItemId) {
      await this.updateStock(createdProduct.inventoryItemId, saree.stock);
      createdProduct.stock = saree.stock;
    }

    return createdProduct;
  },

  async ensureAllSareesCollection(): Promise<string> {
    const title = 'All Sarees';
    const handle = 'all-sarees';
    const collections = await shopifyCollection.list(250);
    const existing = collections.find(c => c.handle === handle);
    if (existing) return existing.id;

    const mutation = `
      mutation collectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection { id title }
          userErrors { message }
        }
      }
    `;
    const res = await shopifyAdminFetch<{
      collectionCreate: { collection: any; userErrors: Array<{ message: string }> };
    }>({
      query: mutation,
      variables: {
        input: { title, handle }
      }
    });
    if (res.collectionCreate.userErrors.length) {
      throw new Error(`Failed to create "All Sarees" collection: ${res.collectionCreate.userErrors[0].message}`);
    }
    return res.collectionCreate.collection.id;
  },

  async collectionAddProducts(collectionId: string, productIds: string[]) {
    const mutation = `
      mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          userErrors { message }
        }
      }
    `;
    const res = await shopifyAdminFetch<{
      collectionAddProducts: { userErrors: Array<{ message: string }> };
    }>({
      query: mutation,
      variables: { id: collectionId, productIds }
    });
    // Ignore errors (like if it's already in the collection)
  },

  async addProductToCollections(productId: string, tags: string[]) {
    // 1. Ensure "All Sarees" manual collection and add the product.
    const allId = await this.ensureAllSareesCollection();
    await this.collectionAddProducts(allId, [productId]);

    // 2. For each tag, ensure a smart collection exists.
    // The product will be added automatically because it has the tag.
    for (const tag of tags) {
      const smartTitle = `Sarees - ${tag}`;
      await shopifyCollection.createSmart(smartTitle, tag);
    }
  },

  async ensurePublished(productId: string) {
    const pubQuery = `
      query {
        publications(first: 10) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;
    const pubRes = await shopifyAdminFetch<{ publications: { edges: Array<{ node: { id: string } }> } }>({ query: pubQuery });
    const publicationInputs = pubRes.publications.edges.map(e => ({ publicationId: e.node.id }));

    if (publicationInputs.length > 0) {
      const mutation = `
        mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { message }
          }
        }
      `;
      await shopifyAdminFetch({
        query: mutation,
        variables: { id: productId, input: publicationInputs }
      });
    }
  },

  // Update an existing Saree product details
  async update(id: string, saree: Partial<SareeProduct>): Promise<SareeProduct> {
    const mutation = `
      ${PRODUCT_FRAGMENT}
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            ...ProductDetails
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const productInput: any = { id };

    if (saree.title) productInput.title = saree.title;
    if (saree.descriptionHtml !== undefined) productInput.descriptionHtml = saree.descriptionHtml;
    if (saree.status) productInput.status = saree.status;
    if (saree.tags) {
      const tags = [...saree.tags];
      if (saree.metafields?.foundersExclusive && !tags.includes('Founders-Exclusive')) {
        tags.push('Founders-Exclusive');
      }
      productInput.tags = tags;
      // Re-apply collections based on tags
      await this.addProductToCollections(id, tags);
    }

    await this.ensurePublished(id);

    // Map Metafields
    if (saree.metafields) {
      const metafields = [];
      const m = saree.metafields;
      
      if (m.fabric !== undefined) metafields.push({ namespace: "saree", key: "fabric", value: m.fabric, type: "single_line_text_field" });
      if (m.weave !== undefined) metafields.push({ namespace: "saree", key: "weave", value: m.weave, type: "single_line_text_field" });
      if (m.colorFamily !== undefined) metafields.push({ namespace: "saree", key: "color_family", value: m.colorFamily, type: "single_line_text_field" });
      if (m.occasion !== undefined) metafields.push({ namespace: "saree", key: "occasion", value: m.occasion, type: "single_line_text_field" });
      if (m.region !== undefined) metafields.push({ namespace: "saree", key: "region", value: m.region, type: "single_line_text_field" });
      if (m.blouseIncluded !== undefined) metafields.push({ namespace: "saree", key: "blouse_included", value: m.blouseIncluded ? 'true' : 'false', type: "single_line_text_field" });
      if (m.blouseLength !== undefined) metafields.push({ namespace: "saree", key: "blouse_length", value: m.blouseLength, type: "single_line_text_field" });
      if (m.washCare !== undefined) metafields.push({ namespace: "saree", key: "wash_care_v2", value: m.washCare, type: "multi_line_text_field" });
      if (m.sareeLength !== undefined) metafields.push({ namespace: "saree", key: "saree_length", value: m.sareeLength || '6.0', type: "single_line_text_field" });
      if (m.foundersExclusive !== undefined) metafields.push({ namespace: "saree", key: "founders_exclusive", value: m.foundersExclusive ? 'true' : 'false', type: "single_line_text_field" });
      
      if (m.shortVideo?.id) {
        metafields.push({ namespace: "saree", key: "short_video", value: m.shortVideo.id, type: "file_reference" });
      }

      productInput.metafields = metafields;
    }

    // Update variant price, compareAtPrice or SKU if defined
    const existing = await this.get(id);
    if (saree.price !== undefined || saree.compareAtPrice !== undefined || saree.sku !== undefined) {
      if (existing) {
        await this.updateVariant(existing.id, saree.price, saree.compareAtPrice, saree.sku);
      }
    }

    const res = await shopifyAdminFetch<{ productUpdate: { product: any, userErrors: Array<{ message: string }> } }>({
      query: mutation,
      variables: { input: productInput }
    });

    if (res.productUpdate.userErrors.length > 0) {
      throw new Error(`Shopify Saree update failed: ${res.productUpdate.userErrors[0].message}`);
    }

    // Handle Images Updates (diff existing vs new)
    if ((saree as any).images && Array.isArray((saree as any).images) && existing) {
      // Shopify's URLs might have query parameters (e.g., ?v=123). We should ignore them for comparison
      const normalizeUrl = (url: string) => url ? url.split('?')[0] : '';
      
      const incomingImageUrls = (saree as any).images.map((img: any) => normalizeUrl(img.url)).filter(Boolean);
      const existingImageUrls = (existing.images || []).map((img: any) => normalizeUrl(img.url));

      // New images to upload
      const newImages = (saree as any).images.filter((img: any) => !existingImageUrls.includes(normalizeUrl(img.url)));

      // Deleted images to remove
      const deletedMediaIds = (existing.images || [])
        .filter((img: any) => !incomingImageUrls.includes(normalizeUrl(img.url)))
        .map((img: any) => img.id);

      // 1. Delete removed media
      if (deletedMediaIds.length > 0) {
        const deleteMutation = `
          mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
            productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
              mediaUserErrors { message }
            }
          }
        `;
        await shopifyAdminFetch({
          query: deleteMutation,
          variables: { productId: id, mediaIds: deletedMediaIds }
        });
      }

      // 2. Add new media
      if (newImages.length > 0) {
        const mediaInput = newImages.map((img: any) => ({
          originalSource: (img.id && img.id.startsWith("gid://")) ? img.id : img.url,
          mediaContentType: "IMAGE"
        }));

        const mediaMutation = `
          mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
            productCreateMedia(media: $media, productId: $productId) {
              mediaUserErrors { message field }
            }
          }
        `;
        const resMedia = await shopifyAdminFetch<{ productCreateMedia: { mediaUserErrors: Array<{ message: string, field: string[] }> } }>({
          query: mediaMutation,
          variables: { productId: id, media: mediaInput }
        });
        if (resMedia.productCreateMedia?.mediaUserErrors?.length > 0) {
          throw new Error(`Media attachment failed: ${resMedia.productCreateMedia.mediaUserErrors[0].message}`);
        }
      }
    }

    const updatedProduct = mapShopifyProduct(res.productUpdate.product);

    // Update stock quantity
    if (saree.stock !== undefined && updatedProduct.inventoryItemId) {
      await this.updateStock(updatedProduct.inventoryItemId, saree.stock);
      updatedProduct.stock = saree.stock;
    }

    return updatedProduct;
  },

  // Delete a product in Shopify
  async delete(id: string): Promise<boolean> {
    const mutation = `
      mutation productDelete($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors {
            message
          }
        }
      }
    `;
    const res = await shopifyAdminFetch<{ productDelete: { deletedProductId: string, userErrors: Array<{ message: string }> } }>({
      query: mutation,
      variables: { input: { id } }
    });
    return res.productDelete.userErrors.length === 0;
  },

  // Internal helper to set exact inventory quantities
  async updateStock(inventoryItemId: string, quantity: number): Promise<void> {
    // 1. Get location ID first
    const locQuery = `
      query getLocations {
        locations(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;
    const locRes = await shopifyAdminFetch<{ locations: { edges: Array<{ node: { id: string } }> } }>({ query: locQuery });
    const locationId = locRes.locations.edges[0]?.node.id;

    if (!locationId) throw new Error("Shopify Locations not configured");

    const mutation = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
          inventoryAdjustmentGroup {
            createdAt
          }
          userErrors {
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        name: "available",
        reason: "correction",
        quantities: [
          {
            inventoryItemId,
            locationId,
            quantity,
            changeFromQuantity: null
          }
        ]
      },
      idempotencyKey: crypto.randomUUID()
    };

    const res = await shopifyAdminFetch<{ inventorySetQuantities: { userErrors: Array<{ message: string }> } }>({
      query: mutation,
      variables
    });

    if (res.inventorySetQuantities.userErrors.length > 0) {
      throw new Error(`Inventory stock update failed: ${res.inventorySetQuantities.userErrors[0].message}`);
    }
  },

  // Helper to update a product variant's price, compareAtPrice or SKU
  async updateVariant(productId: string, price?: number, compareAtPrice?: number | null, sku?: string): Promise<void> {
    // Get the variant ID
    const query = `
      query getVariant($id: ID!) {
        product(id: $id) {
          variants(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `;
    const data = await shopifyAdminFetch<{ product: { variants: { edges: Array<{ node: { id: string } }> } } }>({
      query,
      variables: { id: productId }
    });
    const variantId = data.product.variants.edges[0]?.node.id;

    if (!variantId) return;

    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors {
            message
          }
        }
      }
    `;

    const variantInput: any = { id: variantId, inventoryPolicy: "DENY" };
    if (price !== undefined) variantInput.price = price.toString();
    if (compareAtPrice !== undefined) variantInput.compareAtPrice = compareAtPrice ? compareAtPrice.toString() : null;
    if (sku !== undefined) {
      variantInput.inventoryItem = {
        sku: sku
      };
    }

    await shopifyAdminFetch({
      query: mutation,
      variables: {
        productId,
        variants: [variantInput]
      }
    });
  },

  /**
   * Uploads an image or video file directly to Shopify using Staged Uploads API.
   * This is a 100% native integration allowing direct video and image uploads.
   */
  async uploadMedia(fileName: string, mimeType: string, fileBuffer: Buffer): Promise<{ id: string, url: string }> {
    // 1. Create Staged Upload URL
    const mutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            message
          }
        }
      }
    `;

    const uploadInput: any = {
      resource: mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      filename: fileName,
      mimeType: mimeType,
      httpMethod: 'POST'
    };

    if (mimeType.startsWith('video/')) {
      uploadInput.fileSize = String(fileBuffer.length);
    }

    const stagedRes = await shopifyAdminFetch<{ stagedUploadsCreate: { stagedTargets: Array<{ url: string, resourceUrl: string, parameters: Array<{ name: string, value: string }> }>, userErrors: Array<{ message: string }> } }>({
      query: mutation,
      variables: {
        input: [uploadInput]
      }
    });

    if (stagedRes.stagedUploadsCreate.userErrors.length > 0) {
      throw new Error(`Staged upload registration failed: ${stagedRes.stagedUploadsCreate.userErrors[0].message}`);
    }

    const target = stagedRes.stagedUploadsCreate.stagedTargets[0];
    
    // 2. Perform the Multipart POST request to staged target (AWS S3 or GCS)
    const formData = new FormData();
    target.parameters.forEach(p => {
      formData.append(p.name, p.value);
    });
    
    // Append the file buffer as a blob
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    formData.append('file', blob, fileName);

    const uploadRes = await fetch(target.url, {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload media to staged target: ${errText}`);
    }

    // 3. Register the uploaded file within Shopify's database
    const fileRegisterMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            alt
            createdAt
            ... on Video {
              sources {
                url
              }
            }
            ... on MediaImage {
              image {
                url
              }
            }
          }
          userErrors {
            message
          }
        }
      }
    `;

    const registerRes = await shopifyAdminFetch<{ fileCreate: { files: Array<any>, userErrors: Array<{ message: string }> } }>({
      query: fileRegisterMutation,
      variables: {
        files: [
          {
            alt: fileName.split('.')[0],
            contentType: mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE',
            originalSource: target.resourceUrl
          }
        ]
      }
    });

    if (registerRes.fileCreate.userErrors.length > 0) {
      throw new Error(`Media registration in Shopify failed: ${registerRes.fileCreate.userErrors[0].message}`);
    }

    const registeredFile = registerRes.fileCreate.files[0];
    
    let fileUrl = '';
    if (mimeType.startsWith('video/')) {
      fileUrl = registeredFile.sources?.[0]?.url || target.resourceUrl;
    } else {
      fileUrl = registeredFile.image?.url || target.resourceUrl;
    }

    return {
      id: registeredFile.id,
      url: fileUrl
    };
  }
};

export interface SareeCollection {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
  rules?: Array<{ column: string; relation: string; condition: string }>;
}

export const shopifyCollection = {
  // List all collections
  async list(limit = 50): Promise<SareeCollection[]> {
    const query = `
      query getCollections($first: Int!) {
        collections(first: $first) {
          edges {
            node {
              id
              title
              handle
              productsCount {
                count
              }
              ruleSet {
                rules {
                  column
                  relation
                  condition
                }
              }
            }
          }
        }
      }
    `;

    try {
      const res = await shopifyAdminFetch<{ collections: { edges: Array<{ node: any }> } }>({
        query,
        variables: { first: limit }
      });

      const mapped = res.collections.edges.map(edge => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        productsCount: edge.node.productsCount?.count || 0,
        rules: edge.node.ruleSet?.rules || []
      }));
      
      // De-duplicate by title to prevent Shopify duplicate collections with same name
      return Array.from(new Map(mapped.map(c => [c.title.trim().toLowerCase(), c])).values());
    } catch (err) {
      console.error("Failed to list collections:", err);
      return [];
    }
  },

  // Create an automated smart collection based on product tag matching
  async createSmart(title: string, tag: string): Promise<boolean> {
    const mutation = `
      mutation collectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        title,
        ruleSet: {
          appliedDisjunctively: false,
          rules: [
            {
              column: "TAG",
              relation: "EQUALS",
              condition: tag
            }
          ]
        }
      }
    };

    try {
      const res = await shopifyAdminFetch<{ collectionCreate: { collection: any, userErrors: Array<{ message: string }> } }>({
        query: mutation,
        variables
      });

      return res.collectionCreate.userErrors.length === 0;
    } catch (err) {
      console.error(`Failed to create Smart Collection for tag ${tag}:`, err);
      return false;
    }
  }
};

export const shopifyOrder = {
  async list(limit = 50): Promise<any[]> {
    const query = `
      query getOrders($first: Int!) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              totalPriceSet {
                presentmentMoney {
                  amount
                }
              }
              displayFinancialStatus
              displayFulfillmentStatus
              customer {
                id
                firstName
                lastName
                phone
                email
              }
              tags
              note
              customAttributes {
                key
                value
              }
              lineItems(first: 20) {
                edges {
                  node {
                    title
                    quantity
                    sku
                    originalUnitPriceSet {
                      presentmentMoney {
                        amount
                      }
                    }
                  }
                }
              }
              shippingAddress {
                firstName
                lastName
                address1
                address2
                city
                province
                zip
                phone
              }
            }
          }
        }
      }
    `;

    try {
      const data = await shopifyAdminFetch<{ orders: { edges: Array<{ node: any }> } }>({
        query,
        variables: { first: limit }
      });
      return data.orders.edges.map(e => e.node);
    } catch (err) {
      console.error("Failed to fetch Shopify orders:", err);
      return [];
    }
  },

  async fulfillOrder(orderId: string, trackingNumber: string, trackingCarrier: string): Promise<boolean> {
    // 1. Get the fulfillment order ID for this order
    const foQuery = `
      query getFulfillmentOrder($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 5) {
            edges {
              node {
                id
                status
                supportedActions
                lineItems(first: 100) {
                  edges {
                    node {
                      id
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const foData = await shopifyAdminFetch<{ order: { fulfillmentOrders: { edges: Array<{ node: any }> } } }>({
      query: foQuery,
      variables: { id: orderId }
    });

    const activeFulfillmentOrder = foData.order?.fulfillmentOrders?.edges?.find(
      e => e.node.status === "OPEN" || e.node.status === "IN_PROGRESS"
    )?.node;

    if (!activeFulfillmentOrder) {
      console.warn("No open fulfillment orders found for this order. It might already be fulfilled.");
      return false;
    }

    // 2. Fulfill the order
    const fulfillmentMutation = `
      mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
        fulfillmentCreateV2(fulfillment: $fulfillment) {
          fulfillment {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const lineItems = activeFulfillmentOrder.lineItems.edges.map((e: any) => ({
      id: e.node.id,
      quantity: e.node.quantity
    }));

    const variables = {
      fulfillment: {
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: activeFulfillmentOrder.id,
            fulfillmentOrderLineItems: lineItems
          }
        ],
        trackingInfo: {
          number: trackingNumber,
          company: trackingCarrier,
          url: `https://track.delhivery.com/share/activity?awb=${trackingNumber}`
        }
      }
    };

    const res = await shopifyAdminFetch<{
      fulfillmentCreateV2: {
        fulfillment: any;
        userErrors: Array<{ message: string }>;
      }
    }>({
      query: fulfillmentMutation,
      variables
    });

    if (res.fulfillmentCreateV2?.userErrors?.length) {
      throw new Error(`Shopify fulfillment failed: ${res.fulfillmentCreateV2.userErrors[0].message}`);
    }

    // 3. Save the AWB in Order tags/custom attributes so the storefront can easily display it too
    const updateOrderMutation = `
      mutation updateOrderTags($id: ID!, $input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            tags
          }
          userErrors {
            message
          }
        }
      }
    `;

    // Retrieve current tags
    const currentTagsQuery = `
      query getOrderTags($id: ID!) {
        order(id: $id) {
          tags
          customAttributes {
            key
            value
          }
        }
      }
    `;
    const tagRes = await shopifyAdminFetch<{ order: { tags: string[], customAttributes: Array<{ key: string, value: string }> } }>({
      query: currentTagsQuery,
      variables: { id: orderId }
    });

    const tags = [...(tagRes.order?.tags || [])];
    if (!tags.includes("Delhivery")) tags.push("Delhivery");
    if (!tags.includes(`AWB-${trackingNumber}`)) tags.push(`AWB-${trackingNumber}`);

    const newAttributes = [...(tagRes.order?.customAttributes || [])];
    if (!newAttributes.some(attr => attr.key.toLowerCase() === "awb")) {
      newAttributes.push({ key: "awb", value: trackingNumber });
    }

    // Prepare note with AWB information
    let existingNote = tagRes.order?.customAttributes?.find(attr => attr.key.toLowerCase() === "note")?.value || "";
    let newNote = `AWB: ${trackingNumber}\n${existingNote}`;

    await shopifyAdminFetch({
      query: updateOrderMutation,
      variables: {
        id: orderId,
        input: {
          id: orderId,
          tags,
          customAttributes: newAttributes,
          note: newNote
        }
      }
    });

    return true;
  }
};

export const shopifyCustomer = {
  async get(id: string): Promise<any> {
    const query = `
      query getCustomerDetails($id: ID!) {
        customer(id: $id) {
          id
          firstName
          lastName
          phone
          email
          numberOfOrders
          amountSpent {
            amount
            currencyCode
          }
          defaultAddress {
            address1
            address2
            city
            province
            zip
            country
            phone
          }
          addresses {
            address1
            address2
            city
            province
            zip
            country
            phone
          }
        }
      }
    `;

    try {
      const res = await shopifyAdminFetch<{ customer: any }>({
        query,
        variables: { id }
      });
      return res.customer;
    } catch (err) {
      console.error("Failed to fetch customer details in CRM:", err);
      return null;
    }
  }
};

