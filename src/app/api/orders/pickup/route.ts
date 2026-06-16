import { NextRequest, NextResponse } from "next/server";
import { schedulePickupWithDelhivery } from "@/lib/delhivery";
import { shopifyAdminFetch } from "@/lib/shopify";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderId, orderIds, pickupDate, pickupTime, expectedCount = 1 } = body;

    if (!pickupDate || !pickupTime) {
      return NextResponse.json({ error: "Pickup date and time are required." }, { status: 400 });
    }

    // 1. Call Delhivery to schedule pickup
    const pickup = await schedulePickupWithDelhivery({
      pickupDate,
      pickupTime,
      expectedCount: Number(expectedCount) || 1,
    });

    if (!pickup.success) {
      return NextResponse.json({ error: pickup.error || "Failed to schedule pickup on Delhivery." }, { status: 502 });
    }

    // 2. Update Shopify order tags & attributes to record pickup details
    const idsToUpdate = Array.isArray(orderIds) ? orderIds : (orderId ? [orderId] : []);
    
    for (const id of idsToUpdate) {
      try {
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
          variables: { id }
        });

        const tags = [...(tagRes.order?.tags || [])];
        if (!tags.includes("Pickup Scheduled")) tags.push("Pickup Scheduled");

        const newAttributes = (tagRes.order?.customAttributes || []).map(attr => ({
          key: attr.key,
          value: String(attr.value ?? "")
        }));
        newAttributes.push({ key: "pickup_id", value: String(pickup.pickupId || "N/A") });
        newAttributes.push({ key: "pickup_date", value: String(pickupDate) });
        newAttributes.push({ key: "pickup_time", value: String(pickupTime) });

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
        console.error(`Shopify pickup tags update failed for order ${id}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      pickupId: pickup.pickupId,
      message: `Pickup scheduled successfully for ${pickupDate} (${pickupTime})`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Pickup scheduling failed." }, { status: 500 });
  }
}
