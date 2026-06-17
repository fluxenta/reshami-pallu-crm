import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { RAZORPAY_WEBHOOK_SECRET } from "@/lib/razorpay";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json({ error: "No signature header provided" }, { status: 400 });
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.warn("Razorpay Webhook signature verification failed.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    // Get current financials
    const data = await db.get("crm:financials");
    let transactions = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    if (!Array.isArray(transactions)) {
      transactions = [];
    }

    let modified = false;

    if (event === "payment.captured") {
      const payment = payload.payload.payment.entity;
      const paymentId = `rzp_pay_${payment.id}`;
      const feeId = `rzp_fee_${payment.id}`;
      const dateStr = new Date(payment.created_at * 1000).toISOString().split("T")[0];

      // Insert payment (Income) if it doesn't exist
      if (!transactions.some((t: any) => t.id === paymentId)) {
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
        modified = true;
      }

      // Insert fee (Expense) if present and not already recorded
      if (payment.fee && payment.fee > 0 && !transactions.some((t: any) => t.id === feeId)) {
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
        modified = true;
      }
    } 
    else if (event === "refund.processed" || event === "refund.created") {
      const refund = payload.payload.refund.entity;
      const refundId = `rzp_rfnd_${refund.id}`;
      const dateStr = new Date(refund.created_at * 1000).toISOString().split("T")[0];

      if (!transactions.some((t: any) => t.id === refundId)) {
        transactions.push({
          id: refundId,
          type: "expense" as const,
          amount: refund.amount / 100,
          date: dateStr,
          notes: `Razorpay Refund (Refund: ${refund.id}, Payment: ${refund.payment_id})`,
          createdAt: new Date(refund.created_at * 1000).toISOString(),
          isSystem: true,
          source: "razorpay",
        });
        modified = true;
      }
    }

    if (modified) {
      // Sort transactions by date descending
      transactions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      await db.set("crm:financials", transactions);
    }

    return NextResponse.json({ success: true, processed: modified });
  } catch (err: any) {
    console.error("Razorpay Webhook execution failed:", err);
    return NextResponse.json({ error: err.message || "Webhook error" }, { status: 500 });
  }
}
