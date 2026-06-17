import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { razorpay } from "@/lib/razorpay";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    // 1. Session verification
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    // Determine the timeframe (default: last 30 days)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    
    // Fetch payments from Razorpay
    let payments: any[] = [];
    try {
      const response = await razorpay.payments.all({
        from: thirtyDaysAgo,
        count: 100, // Sync up to 100 transactions at a time
      });
      payments = response.items || [];
    } catch (err) {
      console.error("Failed to fetch Razorpay payments:", err);
      return NextResponse.json({ error: "Failed to fetch payments from Razorpay" }, { status: 500 });
    }

    // Fetch refunds from Razorpay
    let refunds: any[] = [];
    try {
      const response = await razorpay.refunds.all({
        from: thirtyDaysAgo,
        count: 100,
      });
      refunds = response.items || [];
    } catch (err) {
      console.error("Failed to fetch Razorpay refunds:", err);
      // We can continue even if refunds fetch fails
    }

    // Get current financials
    const data = await db.get("crm:financials");
    let transactions = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    if (!Array.isArray(transactions)) {
      transactions = [];
    }

    // Build a map of existing transaction IDs for fast lookup
    const existingIds = new Set(transactions.map((t: any) => t.id));
    let newItemsCount = 0;

    // 1. Process captured payments & their fees
    for (const payment of payments) {
      if (payment.status !== "captured") continue;

      const paymentId = `rzp_pay_${payment.id}`;
      const feeId = `rzp_fee_${payment.id}`;
      const dateStr = new Date(payment.created_at * 1000).toISOString().split("T")[0];

      // Income Transaction
      if (!existingIds.has(paymentId)) {
        const payNotes = payment.description 
          ? `Razorpay Payment: ${payment.description} (${payment.email || ""})`
          : `Razorpay Payment (${payment.id})`;

        transactions.push({
          id: paymentId,
          type: "side_income" as const,
          amount: payment.amount / 100,
          date: dateStr,
          notes: payNotes,
          createdAt: new Date(payment.created_at * 1000).toISOString(),
          isSystem: true,
          source: "razorpay",
        });
        newItemsCount++;
      }

      // Fee Transaction (Expense)
      if (payment.fee && payment.fee > 0 && !existingIds.has(feeId)) {
        transactions.push({
          id: feeId,
          type: "expense" as const,
          amount: payment.fee / 100,
          date: dateStr,
          notes: `Razorpay Fee & Tax for payment ${payment.id}`,
          createdAt: new Date(payment.created_at * 1000).toISOString(),
          isSystem: true,
          source: "razorpay",
        });
        newItemsCount++;
      }
    }

    // 2. Process refunds
    for (const refund of refunds) {
      // Razorpay refund status: processed, pending, failed. We want processed/pending.
      if (refund.status === "failed") continue;

      const refundId = `rzp_rfnd_${refund.id}`;
      const dateStr = new Date(refund.created_at * 1000).toISOString().split("T")[0];

      if (!existingIds.has(refundId)) {
        transactions.push({
          id: refundId,
          type: "expense" as const, // Refund counts as business expense/outflow
          amount: refund.amount / 100,
          date: dateStr,
          notes: `Razorpay Refund (Refund: ${refund.id}, Payment: ${refund.payment_id})`,
          createdAt: new Date(refund.created_at * 1000).toISOString(),
          isSystem: true,
          source: "razorpay",
        });
        newItemsCount++;
      }
    }

    // Sort by date descending
    transactions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Update Redis
    if (newItemsCount > 0) {
      await db.set("crm:financials", transactions);
    }

    return NextResponse.json({
      success: true,
      syncedCount: newItemsCount,
      totalCount: transactions.length,
      transactions,
    });
  } catch (err: any) {
    console.error("Failed inside Razorpay sync endpoint:", err);
    return NextResponse.json({ error: err.message || "Failed to sync Razorpay" }, { status: 500 });
  }
}
