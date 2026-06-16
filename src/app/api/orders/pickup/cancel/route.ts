import { NextRequest, NextResponse } from "next/server";
import { shopifyAdminFetch } from "@/lib/shopify";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderIds } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "Order IDs are required." }, { status: 400 });
    }

    // Update each order in Shopify to clear pickup tags & attributes
    for (const id of orderIds) {
      try {
        // Retrieve current tags and attributes
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
          variables: { id }
        });

        // Remove "Pickup Scheduled" tag
        const tags = (tagRes.order?.tags || []).filter(t => t !== "Pickup Scheduled");

        // Filter out pickup custom attributes
        const newAttributes = (tagRes.order?.customAttributes || [])
          .filter(attr => !["pickup_id", "pickup_date", "pickup_time"].includes(attr.key.toLowerCase()))
          .map(attr => ({
            key: attr.key,
            value: String(attr.value ?? "")
          }));

        const updateOrderMutation = `
          mutation updateOrderTags($input: OrderInput!) {
            orderUpdate(input: $input) {
              order { id tags }
              userErrors { message }
            }
          }
        `;
        await shopifyAdminFetch({
          query: updateOrderMutation,
          variables: {
            input: {
              id,
              tags,
              customAttributes: newAttributes
            }
          }
        });
      } catch (err: any) {
        console.error(`Failed to clear pickup tags for order ${id}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Pickup status successfully cleared/cancelled in CRM.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Cancellation sync failed." }, { status: 500 });
  }
}
