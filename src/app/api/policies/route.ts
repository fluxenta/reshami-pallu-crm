import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { shopifyAdminFetch } from "@/lib/shopify";

export const revalidate = 0; // Dynamic route

export async function GET(req: NextRequest) {
  try {
    // 1. Session verification
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const query = `
      query getShopPolicies {
        shop {
          shopPolicies {
            type
            title
            body
          }
        }
      }
    `;

    const data = await shopifyAdminFetch<any>({ query });
    const policies = data.shop?.shopPolicies || [];
    
    const getPolicyBody = (type: string) => {
      const p = policies.find((x: any) => x.type === type);
      return p?.body || "";
    };

    return NextResponse.json({
      privacyPolicy: getPolicyBody("PRIVACY_POLICY"),
      refundPolicy: getPolicyBody("REFUND_POLICY"),
      shippingPolicy: getPolicyBody("SHIPPING_POLICY"),
      termsOfService: getPolicyBody("TERMS_OF_SERVICE"),
    });
  } catch (err: any) {
    console.error("Failed to fetch shop policies from Shopify:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch policies" }, { status: 500 });
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
    const { privacyPolicy, refundPolicy, shippingPolicy, termsOfService } = body;

    const mutation = `
      mutation shopPolicyUpdate($shopPolicy: ShopPolicyInput!) {
        shopPolicyUpdate(shopPolicy: $shopPolicy) {
          shopPolicy {
            title
            type
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updates = [];
    if (privacyPolicy !== undefined) updates.push({ type: "PRIVACY_POLICY", body: privacyPolicy });
    if (refundPolicy !== undefined) updates.push({ type: "REFUND_POLICY", body: refundPolicy });
    if (shippingPolicy !== undefined) updates.push({ type: "SHIPPING_POLICY", body: shippingPolicy });
    if (termsOfService !== undefined) updates.push({ type: "TERMS_OF_SERVICE", body: termsOfService });

    for (const update of updates) {
      const data = await shopifyAdminFetch<any>({
        query: mutation,
        variables: { shopPolicy: update }
      });

      const userErrors = data.shopPolicyUpdate?.userErrors || [];
      if (userErrors.length > 0) {
        return NextResponse.json({ error: `${update.type} update failed: ${userErrors[0].message}` }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to update shop policies in Shopify:", err);
    return NextResponse.json({ error: err.message || "Failed to update policies" }, { status: 500 });
  }
}

