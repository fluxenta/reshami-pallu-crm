import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

import { shopifyOrder } from "@/lib/shopify";

export const revalidate = 0; // Dynamic route

export async function GET(req: NextRequest) {
  try {
    // 1. Session verification
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const data = await db.get("crm:financials");
    const transactions = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    
    // Fetch live orders from Shopify and convert fulfilled orders to dynamic side_income entries
    let orderTransactions: any[] = [];
    try {
      const orders = await shopifyOrder.list(150);
      const fulfilled = orders.filter((o: any) => o.displayFulfillmentStatus === "FULFILLED");
      orderTransactions = fulfilled.map((o: any) => {
        const amount = parseFloat(o.totalPriceSet?.presentmentMoney?.amount || "0");
        return {
          id: `order_${o.id.split("/").pop()}`,
          type: "side_income" as const,
          amount,
          date: o.createdAt.split("T")[0],
          notes: `Shopify Sales (Order ${o.name})`,
          createdAt: o.createdAt,
          isSystem: true,
        };
      });
    } catch (orderErr) {
      console.error("Failed to load Shopify orders inside financials API:", orderErr);
    }

    const combined = [...transactions, ...orderTransactions];
    // Sort combined transactions by date descending
    combined.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ transactions: combined });
  } catch (err: any) {
    console.error("Failed to fetch financials:", err);
    return NextResponse.json({ transactions: [], error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Session verification
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const body = await req.json();
    const { action, id, type, amount, date, notes } = body;

    const data = await db.get("crm:financials");
    let transactions = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    if (!Array.isArray(transactions)) {
      transactions = [];
    }

    if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "Transaction ID is required for deletion." }, { status: 400 });
      }
      transactions = transactions.filter((t: any) => t.id !== id);
      await db.set("crm:financials", transactions);
      return NextResponse.json({ success: true, transactions });
    }

    // Add new transaction
    if (!type || !amount || !date) {
      return NextResponse.json({ error: "Type, amount, and date are required." }, { status: 400 });
    }

    const newTransaction = {
      id: "tx_" + Math.random().toString(36).substring(2, 11),
      type, // 'cost' | 'expense' | 'side_income'
      amount: Number(amount),
      date,
      notes: notes || "",
      createdAt: new Date().toISOString(),
    };

    transactions.push(newTransaction);
    // Sort transactions by date descending
    transactions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    await db.set("crm:financials", transactions);
    return NextResponse.json({ success: true, transactions, transaction: newTransaction });
  } catch (err: any) {
    console.error("Failed to save transaction in Redis:", err);
    return NextResponse.json({ error: err.message || "Failed to save transaction" }, { status: 500 });
  }
}
