import { NextRequest, NextResponse } from "next/server";
import { shopifyAdminFetch } from "@/lib/shopify";
import { cancelShipmentWithDelhivery } from "@/lib/delhivery";

const GET_ORDER_FULFILLMENTS_AND_METADATA = `
  query getOrderFulfillments($id: ID!) {
    order(id: $id) {
      tags
      note
      customAttributes {
        key
        value
      }
      fulfillments(first: 5) {
        id
        status
      }
    }
  }
`;

const FULFILLMENT_CANCEL = `
  mutation fulfillmentCancel($id: ID!) {
    fulfillmentCancel(id: $id) {
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

const UPDATE_ORDER = `
  mutation updateOrder($input: OrderInput!) {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // 1. Fetch fulfillment details, tags, attributes from Shopify
    const orderData = await shopifyAdminFetch<any>({
      query: GET_ORDER_FULFILLMENTS_AND_METADATA,
      variables: { id: orderId }
    });

    const order = orderData?.order;
    if (!order) {
      return NextResponse.json({ error: "Order not found in Shopify" }, { status: 404 });
    }

    // Determine AWB number
    const awbAttribute = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "awb" || attr.key.toLowerCase() === "trackingid"
    );
    let awb = awbAttribute ? awbAttribute.value : null;
    if (!awb && order.note) {
      const awbMatch = order.note.match(/AWB:\s*([^\s,]+)/i);
      if (awbMatch) awb = awbMatch[1];
    }

    let delhiveryCancelled = false;
    let delhiveryError = null;

    // 2. Cancel on Delhivery if AWB is present
    if (awb) {
      try {
        const dlvRes = await cancelShipmentWithDelhivery(awb);
        if (dlvRes.success) {
          delhiveryCancelled = true;
        } else {
          delhiveryError = dlvRes.error;
          // If already cancelled or not found, we treat it as success to clean up Shopify side
          if (dlvRes.error?.toLowerCase().includes("already cancelled") || dlvRes.error?.toLowerCase().includes("not found")) {
            delhiveryCancelled = true;
          }
        }
      } catch (err: any) {
        console.error("Failed to cancel on Delhivery:", err);
        delhiveryError = err.message;
      }
    }

    // 3. Cancel fulfillments on Shopify if any are open/success
    const fulfillments = order.fulfillments || [];
    for (const f of fulfillments) {
      if (f.status !== "CANCELLED") {
        try {
          const cancelRes = await shopifyAdminFetch<any>({
            query: FULFILLMENT_CANCEL,
            variables: { id: f.id }
          });
          if (cancelRes.fulfillmentCancel?.userErrors?.length) {
            console.error("Shopify fulfillment cancel errors:", cancelRes.fulfillmentCancel.userErrors);
          }
        } catch (err) {
          console.error(`Failed to cancel fulfillment ${f.id} on Shopify:`, err);
        }
      }
    }

    // 4. Clean up tags, custom attributes, and notes in Shopify
    // Remove tags: AWB-*, Delhivery, Courier:*, Pickup Scheduled, delivery_status:*
    let tags = (order.tags || []).filter((t: string) => {
      const lower = t.toLowerCase();
      return (
        !lower.startsWith("awb-") &&
        lower !== "delhivery" &&
        !lower.startsWith("courier:") &&
        lower !== "pickup scheduled" &&
        !lower.startsWith("delivery_status:")
      );
    });

    // Remove attributes: awb, courier_partner, delivery_status, pickup_id, pickup_date, pickup_time
    const newAttributes = (order.customAttributes || [])
      .filter((attr: any) => {
        const key = attr.key.toLowerCase();
        return !["awb", "trackingid", "courier_partner", "delivery_status", "pickup_id", "pickup_date", "pickup_time"].includes(key);
      })
      .map((attr: any) => ({
        key: attr.key,
        value: String(attr.value ?? "")
      }));

    // Clean up note (remove AWB and Courier Cost)
    let note = order.note || "";
    if (awb) {
      note = note.replace(new RegExp(`AWB:\\s*${awb}\\s*\\n?`, "gi"), "");
    }
    note = note.replace(/Courier Cost:\s*₹[\d.]+\s*,?\s*/gi, "");

    // Save changes to Shopify order
    const updateRes = await shopifyAdminFetch<any>({
      query: UPDATE_ORDER,
      variables: {
        input: {
          id: orderId,
          tags,
          customAttributes: newAttributes,
          note
        }
      }
    });

    if (updateRes.orderUpdate?.userErrors?.length) {
      return NextResponse.json({
        error: `Cleaned Delhivery but failed to update Shopify attributes: ${updateRes.orderUpdate.userErrors[0].message}`
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      delhiveryCancelled,
      delhiveryError,
      message: "Shipment successfully cancelled from both Delhivery and Shopify/CRM."
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to cancel shipment" }, { status: 500 });
  }
}
