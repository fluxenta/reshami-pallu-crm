import { NextRequest, NextResponse } from "next/server";
import { bookShipmentWithDelhivery } from "@/lib/delhivery";
import { shopifyOrder } from "@/lib/shopify";

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
    } = body;

    if (!orderId || !customerName || !phone || !address1 || !city || !province || !zip) {
      return NextResponse.json({ error: "Missing required order or address details." }, { status: 400 });
    }

    // 1. Book the shipment with Delhivery
    const booking = await bookShipmentWithDelhivery({
      orderId: orderName || orderId,
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
    });

    if (!booking.success || !booking.awb) {
      return NextResponse.json({ error: booking.error || "Failed to book shipment on Delhivery." }, { status: 502 });
    }

    // 2. Mark the order as fulfilled on Shopify
    try {
      await shopifyOrder.fulfillOrder(orderId, booking.awb, "Delhivery");
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
