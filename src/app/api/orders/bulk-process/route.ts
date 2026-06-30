import { NextRequest, NextResponse } from "next/server";
import { bookShipmentWithDelhivery, schedulePickupWithDelhivery, getDelhiveryCharges } from "@/lib/delhivery";
import { shopifyOrder, shopifyAdminFetch } from "@/lib/shopify";

const GET_ORDER_DETAILS = `
  query GetOrderDetails($id: ID!) {
    order(id: $id) {
      id
      name
      totalPriceSet {
        presentmentMoney { amount }
      }
      customer {
        firstName
        lastName
        phone
        email
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
      lineItems(first: 50) {
        edges {
          node {
            title
            quantity
            sku
            originalUnitPriceSet {
              presentmentMoney { amount }
            }
          }
        }
      }
    }
  }
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orders, pickupDate, pickupTime } = body;

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: "No orders selected for processing." }, { status: 400 });
    }

    if (!pickupDate || !pickupTime) {
      return NextResponse.json({ error: "Pickup date and time slots are required." }, { status: 400 });
    }

    const results: any[] = [];
    const manifestedAwbList: string[] = [];
    const successfullyFulfillmentOrderIds: string[] = [];

    // Step 1: Create shipments one-by-one
    for (const item of orders) {
      const { orderId, weightGrams, length, width, height } = item;
      const weightKg = Number(weightGrams) / 1000;

      try {
        // Fetch order info from Shopify
        const orderData = await shopifyAdminFetch<any>({
          query: GET_ORDER_DETAILS,
          variables: { id: orderId }
        });

        const orderObj = orderData?.order;
        if (!orderObj) {
          throw new Error(`Order ${orderId} not found in Shopify.`);
        }

        const phone = orderObj.shippingAddress?.phone || orderObj.customer?.phone || "";
        const customerName = `${orderObj.shippingAddress?.firstName || orderObj.customer?.firstName || "Customer"} ${orderObj.shippingAddress?.lastName || orderObj.customer?.lastName || ""}`.trim();
        const address1 = orderObj.shippingAddress?.address1;
        const city = orderObj.shippingAddress?.city;
        const province = orderObj.shippingAddress?.province;
        const zip = orderObj.shippingAddress?.zip;

        if (!address1 || !city || !province || !zip || !phone) {
          throw new Error(`Missing shipping address details or phone number for order ${orderObj.name}.`);
        }

        const products = orderObj.lineItems?.edges?.map((e: any) => ({
          name: e.node.title,
          qty: e.node.quantity || 1,
          price: parseFloat(e.node.originalUnitPriceSet?.presentmentMoney?.amount || "0"),
          sku: e.node.sku || "N/A"
        })) || [];

        const totalPrice = parseFloat(orderObj.totalPriceSet?.presentmentMoney?.amount || "0");
        const cleanOrderName = (orderObj.name || orderId).replace(/^#/, "");
        const uniqueOrderName = `${cleanOrderName}-R${Math.floor(10 + Math.random() * 90)}`;

        // Book with Delhivery
        const booking = await bookShipmentWithDelhivery({
          orderId: uniqueOrderName,
          customerName,
          address: {
            line1: address1,
            line2: orderObj.shippingAddress?.address2 || "",
            city,
            state: province,
            pincode: zip,
            mobile: phone
          },
          weightKg,
          length: length ? Number(length) : undefined,
          width: width ? Number(width) : undefined,
          height: height ? Number(height) : undefined,
          packageDesc: products.map((p: any) => p.name).join(", "),
          products,
          totalPrice
        });

        if (!booking.success || !booking.awb) {
          throw new Error(booking.error || "Failed to book shipment on Delhivery.");
        }

        manifestedAwbList.push(booking.awb);
        successfullyFulfillmentOrderIds.push(orderId);

        // Mark as fulfilled on Shopify
        let actualCourierCost: number | undefined = undefined;
        try {
          actualCourierCost = await getDelhiveryCharges(
            zip,
            weightKg > 0 ? weightKg : 1.0,
            length ? Number(length) : 40,
            width ? Number(width) : 30,
            height ? Number(height) : 6
          );
        } catch (err) {
          console.error(`Failed to estimate charges for ${booking.awb}:`, err);
        }

        await shopifyOrder.fulfillOrder(orderId, booking.awb, "Delhivery", actualCourierCost);

        results.push({ orderId, name: orderObj.name, awb: booking.awb, success: true });
      } catch (err: any) {
        console.error(`Bulk Fulfill failed for order ${orderId}:`, err);
        results.push({ orderId, success: false, error: err.message });
      }
    }

    // Check if we registered any shipments successfully
    if (successfullyFulfillmentOrderIds.length === 0) {
      return NextResponse.json({
        error: "All shipment bookings failed.",
        details: results
      }, { status: 502 });
    }

    // Step 2: Create pickup for all successfully created shipments at once
    let pickupId = "N/A";
    let pickupError: string | null = null;

    try {
      const pickupBooking = await schedulePickupWithDelhivery({
        pickupDate,
        pickupTime,
        expectedCount: successfullyFulfillmentOrderIds.length
      });

      if (pickupBooking.success && pickupBooking.pickupId) {
        pickupId = String(pickupBooking.pickupId);

        // Update scheduled pickup info in tags & custom attributes for all successfully fulfilled orders
        for (const id of successfullyFulfillmentOrderIds) {
          try {
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
            newAttributes.push({ key: "pickup_id", value: pickupId });
            newAttributes.push({ key: "pickup_date", value: String(pickupDate) });
            newAttributes.push({ key: "pickup_time", value: String(pickupTime) });

            const updateOrderMutation = `
              mutation updateOrderTags($input: OrderInput!) {
                orderUpdate(input: $input) {
                  order { id }
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
            console.error(`Failed to assign pickup info to order ${id}:`, err);
          }
        }
      } else {
        pickupError = pickupBooking.error || "Failed to schedule pickup slot with Delhivery.";
      }
    } catch (err: any) {
      pickupError = err.message || "Pickup scheduling failed.";
    }

    return NextResponse.json({
      ok: true,
      results,
      pickupId,
      pickupError,
      message: `Processed ${successfullyFulfillmentOrderIds.length} orders. Pickup ID: ${pickupId}`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Bulk shipment & pickup scheduling failed." }, { status: 500 });
  }
}
