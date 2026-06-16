import { NextRequest, NextResponse } from "next/server";
import { bookShipmentWithDelhivery, getDelhiveryCharges } from "@/lib/delhivery";
import { shopifyOrder, shopifyAdminFetch } from "@/lib/shopify";

const GET_ORDER_DETAILS = `
  query GetOrderDetails($id: ID!) {
    order(id: $id) {
      name
      totalPriceSet {
        presentmentMoney {
          amount
        }
      }
      lineItems(first: 50) {
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
    }
  }
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      orderId,
      orderName,
      customerName,
      phone,
      address1,
      address2,
      city,
      province,
      zip,
      weight,
      length,
      width,
      height,
      packageDesc,
    } = body;

    if (!orderId || !customerName || !phone || !address1 || !city || !province || !zip) {
      return NextResponse.json({ error: "Missing required order or address details." }, { status: 400 });
    }

    // 1. Fetch exact order pricing and items from Shopify
    let products: any[] = [];
    let totalPrice = 0;
    let shopifyOrderName = "";
    try {
      const orderData = await shopifyAdminFetch<any>({
        query: GET_ORDER_DETAILS,
        variables: { id: orderId },
      });
      const orderObj = orderData?.order;
      if (orderObj) {
        shopifyOrderName = orderObj.name || "";
        totalPrice = parseFloat(orderObj.totalPriceSet?.presentmentMoney?.amount || "0");
        products = orderObj.lineItems?.edges?.map((e: any) => ({
          name: e.node.title,
          qty: e.node.quantity || 1,
          price: parseFloat(e.node.originalUnitPriceSet?.presentmentMoney?.amount || "0"),
          sku: e.node.sku || "N/A",
        })) || [];
      }
    } catch (err) {
      console.error("Failed to fetch order details for Delhivery booking:", err);
    }

    // 2. Book the shipment with Delhivery
    const cleanOrderName = (shopifyOrderName || orderName || orderId).replace(/^#/, "");
    const booking = await bookShipmentWithDelhivery({
      orderId: cleanOrderName,
      customerName,
      address: {
        line1: address1,
        line2: address2 || "",
        city,
        state: province,
        pincode: zip,
        mobile: phone,
      },
      weightKg: weight ? Number(weight) : 0.5,
      length: length ? Number(length) : undefined,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
      packageDesc: packageDesc || undefined,
      products,
      totalPrice,
    });

    if (!booking.success || !booking.awb) {
      return NextResponse.json({ error: booking.error || "Failed to book shipment on Delhivery." }, { status: 502 });
    }

    // 2. Mark the order as fulfilled on Shopify
    try {
      let actualCourierCost: number | undefined = undefined;
      try {
        actualCourierCost = await getDelhiveryCharges(
          zip,
          weight ? Number(weight) : 0.5,
          length ? Number(length) : undefined,
          width ? Number(width) : undefined,
          height ? Number(height) : undefined
        );
        console.log(`[Fulfill] Calculated actual courier cost for AWB ${booking.awb}: ₹${actualCourierCost}`);
      } catch (err) {
        console.error("[Fulfill] Failed to fetch live courier charges:", err);
      }

      await shopifyOrder.fulfillOrder(orderId, booking.awb, "Delhivery", actualCourierCost);
    } catch (err: any) {
      console.error("Shopify fulfillment sync failed:", err);
      // Even if Shopify update fails, we return the Delhivery AWB so the merchant doesn't lose it!
      return NextResponse.json({
        ok: true,
        awb: booking.awb,
        warning: "Delhivery booked successfully, but Shopify fulfillment update failed: " + err.message,
      });
    }

    return NextResponse.json({
      ok: true,
      awb: booking.awb,
      message: "Order successfully booked and marked as fulfilled!",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fulfillment booking failed." }, { status: 500 });
  }
}
