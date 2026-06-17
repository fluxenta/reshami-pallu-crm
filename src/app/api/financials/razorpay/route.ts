import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { razorpay } from "@/lib/razorpay";
import { shopifyOrder } from "@/lib/shopify";
import { sareeDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    // 1. Session verification
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    // Fetch last 100 payments from Razorpay
    const response = await razorpay.payments.all({
      count: 100,
    });
    const rawPayments = response.items || [];

    let shopifyOrders: any[] = [];
    let metaMap: Record<string, { costPrice: number; margin: number; privateNotes?: string }> = {};
    try {
      shopifyOrders = await shopifyOrder.list(150);
      
      const skusSet = new Set<string>();
      shopifyOrders.forEach(order => {
        order.lineItems?.edges?.forEach((e: any) => {
          if (e.node?.sku) skusSet.add(e.node.sku);
        });
      });
      const uniqueSkus = Array.from(skusSet);
      if (uniqueSkus.length > 0) {
        metaMap = await sareeDb.mget(uniqueSkus);
      }
    } catch (err) {
      console.error("Failed to fetch Shopify orders or metaMap for Razorpay mapping:", err);
    }

    // Map payments and parse Shopify Order details
    const payments = rawPayments.map((payment: any) => {
      const notes = payment.notes || {};
      const searchFields = [
        notes.shopify_order_id,
        notes.order_id,
        notes.merchant_order_id,
        notes.shopify_order_name,
        payment.description,
      ];
      
      let shopifyOrderName: string | null = null;

      // 1. Try regex matching on Notes & Description
      for (const val of searchFields) {
        if (!val) continue;
        const match = String(val).match(/#?RP-\d+/i);
        if (match) {
          shopifyOrderName = match[0].toUpperCase();
          if (!shopifyOrderName.startsWith("#")) {
            shopifyOrderName = "#" + shopifyOrderName;
          }
          break;
        }
      }

      // Helper function to normalize phone numbers for matching
      const normalizePhone = (p: string) => {
        if (!p) return "";
        return p.replace(/\D/g, "").slice(-10); // Match last 10 digits
      };

      const paymentPhone = normalizePhone(payment.contact || "");
      const paymentEmail = (payment.email || "").toLowerCase().trim();

      // 2. Fallback: Match against live Shopify orders
      let matchedOrder: any = null;
      if (!shopifyOrderName && shopifyOrders.length > 0) {
        matchedOrder = shopifyOrders.find((order: any) => {
          const orderEmail = (order.customer?.email || "").toLowerCase().trim();
          const orderPhone = normalizePhone(order.customer?.phone || order.shippingAddress?.phone || "");
          
          // Check for email match
          if (paymentEmail && paymentEmail !== "void@razorpay.com" && paymentEmail === orderEmail) {
            return true;
          }
          // Check for phone match
          if (paymentPhone && paymentPhone === orderPhone) {
            return true;
          }
          return false;
        });

        if (matchedOrder) {
          shopifyOrderName = matchedOrder.name;
        }
      } else if (shopifyOrderName && shopifyOrders.length > 0) {
        matchedOrder = shopifyOrders.find((order: any) => order.name === shopifyOrderName) || null;
      }

      return {
        id: payment.id,
        amount: payment.amount / 100,
        fee: payment.fee ? payment.fee / 100 : 0,
        tax: payment.tax ? payment.tax / 100 : 0,
        status: payment.status, // captured, failed, authorized, refunded
        method: payment.method, // card, netbanking, wallet, upi
        email: payment.email || "N/A",
        contact: payment.contact || "N/A",
        createdAt: new Date(payment.created_at * 1000).toISOString(),
        orderId: payment.order_id || "N/A",
        description: payment.description || "",
        shopifyOrderName,
        shopifyOrder: matchedOrder,
      };
    });

    // Calculate aggregations based on the fetched set
    const totalCaptured = payments
      .filter((p: any) => p.status === "captured")
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    const totalFees = payments
      .filter((p: any) => p.status === "captured")
      .reduce((sum: number, p: any) => sum + p.fee, 0);

    const totalRefunded = payments
      .filter((p: any) => p.status === "refunded")
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    const totalFailed = payments
      .filter((p: any) => p.status === "failed")
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    return NextResponse.json({
      success: true,
      payments,
      summary: {
        totalCaptured,
        totalFees,
        totalRefunded,
        totalFailed,
      },
      metaMap,
    });
  } catch (err: any) {
    console.error("Failed to fetch Razorpay data:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch Razorpay data" }, { status: 500 });
  }
}
