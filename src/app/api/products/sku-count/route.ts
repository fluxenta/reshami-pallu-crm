import { NextRequest, NextResponse } from "next/server";
import { shopifyAdminFetch } from "@/lib/shopify";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const color = searchParams.get("color") || "RED";

    const query = `
      query countProducts($query: String!) {
        productsCount(query: $query) {
          count
        }
      }
    `;

    const data = await shopifyAdminFetch<{ productsCount: { count: number } }>({
      query,
      variables: {
        query: `sku:RP-${color}-*`
      }
    });

    return NextResponse.json({ count: data.productsCount?.count || 0 });
  } catch (err: any) {
    // If it fails or the color prefix is new, return a safe fallback default count
    return NextResponse.json({ count: 0 });
  }
}
