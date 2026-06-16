import { NextRequest, NextResponse } from "next/server";
import { shopifyAdminFetch } from "@/lib/shopify";

const GET_FULFILLMENT_ORDER_AND_DETAILS = `
  query getFulfillmentOrder($id: ID!) {
    order(id: $id) {
      tags
      note
      customAttributes {
        key
        value
      }
      fulfillmentOrders(first: 5) {
        edges {
          node {
            id
            status
            lineItems(first: 100) {
              edges {
                node {
                  id
                  totalQuantity
                }
              }
            }
          }
        }
      }
    }
  }
`;

const FULFILLMENT_CREATE = `
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

const UPDATE_ORDER = `
  mutation updateOrder($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        id
        tags
        customAttributes {
          key
          value
        }
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
    const { orderId, awb, courierPartner, action } = body; // action: "dispatch" | "deliver"

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // 1. Fetch current order tags, attributes, and open fulfillment orders
    const orderData = await shopifyAdminFetch<any>({
      query: GET_FULFILLMENT_ORDER_AND_DETAILS,
      variables: { id: orderId }
    });

    if (!orderData?.order) {
      return NextResponse.json({ error: "Order not found in Shopify" }, { status: 404 });
    }

    const order = orderData.order;
    let tags = [...(order.tags || [])];
    let customAttributes = (order.customAttributes || []).map((attr: any) => ({
      key: attr.key,
      value: String(attr.value ?? "")
    }));
    let note = order.note || "";

    if (action === "dispatch") {
      if (!awb || !courierPartner) {
        return NextResponse.json({ error: "AWB and Courier Partner are required for dispatching" }, { status: 400 });
      }

      // Check if there is an active/open fulfillment order to fulfill on Shopify
      const activeFO = order.fulfillmentOrders?.edges?.find(
        (e: any) => e.node.status === "OPEN" || e.node.status === "IN_PROGRESS"
      )?.node;

      if (activeFO) {
        const lineItems = activeFO.lineItems.edges.map((e: any) => ({
          id: e.node.id,
          quantity: e.node.totalQuantity
        }));

        const fulfillmentRes = await shopifyAdminFetch<any>({
          query: FULFILLMENT_CREATE,
          variables: {
            fulfillment: {
              lineItemsByFulfillmentOrder: [
                {
                  fulfillmentOrderId: activeFO.id,
                  fulfillmentOrderLineItems: lineItems
                }
              ],
              trackingInfo: {
                number: awb,
                company: courierPartner,
                url: courierPartner.toLowerCase() === "delhivery"
                  ? `https://track.delhivery.com/share/activity?awb=${awb}`
                  : `https://www.17track.net/en/track?nums=${awb}`
              }
            }
          }
        });

        if (fulfillmentRes.fulfillmentCreateV2?.userErrors?.length) {
          console.warn("Fulfillment creation user errors:", fulfillmentRes.fulfillmentCreateV2.userErrors);
        }
      }

      // Update tags and attributes
      tags = tags.filter(t => !t.startsWith("Courier:") && !t.startsWith("AWB-") && !t.startsWith("delivery_status:"));
      tags.push(`Courier:${courierPartner}`);
      tags.push(`AWB-${awb}`);
      tags.push(`delivery_status:dispatched`);

      customAttributes = customAttributes.filter((attr: any) => 
        attr.key.toLowerCase() !== "awb" &&
        attr.key.toLowerCase() !== "trackingid" &&
        attr.key.toLowerCase() !== "courier_partner" &&
        attr.key.toLowerCase() !== "delivery_status"
      );
      customAttributes.push({ key: "awb", value: awb });
      customAttributes.push({ key: "courier_partner", value: courierPartner });
      customAttributes.push({ key: "delivery_status", value: "dispatched" });

      if (!note.includes(`AWB: ${awb}`)) {
        note = `AWB: ${awb}\n${note}`;
      }
    } else if (action === "deliver") {
      // Mark as delivered
      tags = tags.filter(t => !t.startsWith("delivery_status:"));
      tags.push(`delivery_status:delivered`);

      customAttributes = customAttributes.filter((attr: any) => attr.key.toLowerCase() !== "delivery_status");
      customAttributes.push({ key: "delivery_status", value: "delivered" });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // 2. Update order attributes, tags and notes on Shopify
    const updateRes = await shopifyAdminFetch<any>({
      query: UPDATE_ORDER,
      variables: {
        input: {
          id: orderId,
          tags,
          customAttributes,
          note
        }
      }
    });

    if (updateRes.orderUpdate?.userErrors?.length) {
      return NextResponse.json({ error: updateRes.orderUpdate.userErrors[0].message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: `Successfully marked as ${action === "dispatch" ? "dispatched" : "delivered"}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Manual fulfillment failed" }, { status: 500 });
  }
}
