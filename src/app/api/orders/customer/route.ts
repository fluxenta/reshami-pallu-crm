import { NextRequest, NextResponse } from "next/server";
import { shopifyCustomer } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("id") || "";

    if (!customerId) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const customer = await shopifyCustomer.get(customerId);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, customer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch customer profile" }, { status: 500 });
  }
}
