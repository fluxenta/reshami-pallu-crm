import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shopifyAdminFetch } from "@/lib/shopify";

// Helper to escape HTML characters
function escapeHtml(unsafe: any): string {
  if (typeof unsafe !== "string") return String(unsafe || "");
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * GET /api/orders/receipt?orderId=XXX
 * Returns a beautiful HTML order receipt.
 * Fetches from Upstash Redis order summaries first.
 * Fallback: Queries Shopify Admin GraphQL directly so the receipt can still render even if Redis cache is missing!
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId") || "";

    if (!orderId) {
      return new NextResponse("Missing orderId parameter", { status: 400 });
    }

    let summary: any = null;
    const key = `order:summary:${orderId}`;
    const cached = await db.get(key);
    if (cached) {
      summary = typeof cached === "string" ? JSON.parse(cached) : cached;
    }

    // Fallback: If not found in Redis, query Shopify Admin directly
    if (!summary) {
      console.log(`[Receipt Fallback] Order summary not cached in Redis. Querying Shopify for ID: ${orderId}`);
      
      const query = `
        query getOrderReceiptDetails($id: ID!) {
          order(id: $id) {
            id
            name
            createdAt
            email
            phone
            subtotalPriceSet {
              presentmentMoney { amount }
            }
            totalShippingPriceSet {
              presentmentMoney { amount }
            }
            totalTaxSet {
              presentmentMoney { amount }
            }
            totalDiscountsSet {
              presentmentMoney { amount }
            }
            totalPriceSet {
              presentmentMoney { amount }
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
                  variantTitle
                  originalUnitPriceSet {
                    presentmentMoney { amount }
                  }
                }
              }
            }
          }
        }
      `;

      try {
        const res = await shopifyAdminFetch<{ order: any }>({
          query,
          variables: { id: orderId }
        });

        if (res?.order) {
          const shopifyOrder = res.order;
          
          // Map Shopify fields to match the receipt summary structure
          summary = {
            orderNumber: shopifyOrder.name,
            orderDate: new Date(shopifyOrder.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric"
            }),
            confirmationEmail: shopifyOrder.email || "—",
            customerPhone: shopifyOrder.phone || shopifyOrder.shippingAddress?.phone || "—",
            shippingAddress: shopifyOrder.shippingAddress ? {
              fullName: `${shopifyOrder.shippingAddress.firstName} ${shopifyOrder.shippingAddress.lastName || ""}`.trim(),
              line1: shopifyOrder.shippingAddress.address1,
              line2: shopifyOrder.shippingAddress.address2 || "",
              city: shopifyOrder.shippingAddress.city,
              state: shopifyOrder.shippingAddress.province,
              pincode: shopifyOrder.shippingAddress.zip
            } : null,
            items: shopifyOrder.lineItems?.edges?.map((e: any) => ({
              name: e.node.title,
              qty: e.node.quantity,
              variant: e.node.variantTitle || "Default Title",
              price: parseFloat(e.node.originalUnitPriceSet?.presentmentMoney?.amount || "0")
            })) || [],
            subtotal: parseFloat(shopifyOrder.subtotalPriceSet?.presentmentMoney?.amount || "0"),
            shipping: parseFloat(shopifyOrder.totalShippingPriceSet?.presentmentMoney?.amount || "0"),
            tax: parseFloat(shopifyOrder.totalTaxSet?.presentmentMoney?.amount || "0"),
            discount: -parseFloat(shopifyOrder.totalDiscountsSet?.presentmentMoney?.amount || "0"),
            totalPaid: parseFloat(shopifyOrder.totalPriceSet?.presentmentMoney?.amount || "0")
          };
        }
      } catch (shopifyErr) {
        console.error("[Receipt Fallback Error] Querying Shopify failed:", shopifyErr);
      }
    }

    if (!summary) {
      return new NextResponse("Receipt data not found. This order ID does not exist in Shopify or Redis.", { status: 404 });
    }

    const orderNumber = summary.orderNumber || orderId || "—";
    const orderDate = summary.orderDate || new Date().toLocaleDateString("en-IN");
    const email = summary.confirmationEmail || "—";
    const phone = summary.customerPhone || "—";
    const addr = summary.shippingAddress;
    const items: any[] = summary.items || [];
    const subtotal: number = summary.subtotal || 0;
    const shipping: number = summary.shipping || 0;
    const tax: number = summary.tax || 0;
    const discount: number = summary.discount || 0;
    const totalPaid: number = summary.totalPaid || subtotal;

    const itemRows = items
      .map(
        (item) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">
            <div style="font-weight:500;font-size:13px;">${escapeHtml(item.name)}</div>
            ${item.variant && item.variant !== "Default Title" ? `<div style="font-size:11px;color:#888;margin-top:2px;">${escapeHtml(item.variant)}</div>` : ""}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;color:#555;font-size:13px;">${escapeHtml(item.qty)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-size:13px;">₹ ${Number(item.price).toLocaleString("en-IN")}</td>
        </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Order Receipt – ${orderNumber}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    background: #fdf8f2;
    color: #2d2d2d;
    padding: 40px 20px;
  }
  .receipt {
    max-width: 680px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #e8e0d8;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(59,42,74,0.10);
  }
  /* Header */
  .header {
    background: linear-gradient(135deg, #3b2a4a 0%, #5a3f6e 100%);
    padding: 36px 40px 28px;
    color: #fff;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .brand {
    font-size: 26px;
    letter-spacing: 3px;
    text-transform: uppercase;
    font-weight: 400;
    color: #f0e6ff;
  }
  .brand-tagline {
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    margin-top: 2px;
  }
  .order-label {
    margin-top: 20px;
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.6);
  }
  .order-number {
    font-size: 22px;
    font-weight: 600;
    color: #fff;
    margin-top: 2px;
    letter-spacing: 1px;
  }
  .order-date {
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    margin-top: 4px;
  }
  /* Badge */
  .badge {
    display: inline-block;
    margin-top: 12px;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    color: #fff;
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    padding: 4px 12px;
    border-radius: 999px;
  }
  /* Body */
  .body { padding: 32px 40px; }
  .section { margin-bottom: 28px; }
  .section-label {
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #7c5c9a;
    font-weight: 600;
    margin-bottom: 10px;
    border-bottom: 1px solid #f0eaf8;
    padding-bottom: 6px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 20px;
    font-size: 13px;
  }
  .meta-row { display: flex; flex-direction: column; gap: 2px; }
  .meta-key { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #aaa; }
  .meta-val { font-weight: 500; color: #2d2d2d; }
  /* Items table */
  table { width: 100%; border-collapse: collapse; }
  thead th {
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #888;
    padding: 8px;
    text-align: left;
    border-bottom: 2px solid #f0eaf8;
    font-weight: 600;
  }
  thead th:last-child { text-align: right; }
  thead th:nth-child(2) { text-align: center; }
  /* Totals */
  .totals { margin-top: 18px; display: flex; flex-direction: column; gap: 6px; }
  .total-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #555;
  }
  .total-row.grand {
    border-top: 2px solid #3b2a4a;
    margin-top: 8px;
    padding-top: 10px;
    font-size: 17px;
    font-weight: 700;
    color: #3b2a4a;
  }
  /* Footer */
  .footer {
    background: #faf6ff;
    border-top: 1px solid #ede6f7;
    padding: 20px 40px;
    text-align: center;
    font-size: 11px;
    color: #aaa;
    letter-spacing: 0.5px;
  }
  .footer a { color: #7c5c9a; text-decoration: none; }
  /* Print */
  @media print {
    body { background: #fff; padding: 0; }
    .receipt { box-shadow: none; border: none; border-radius: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="no-print" style="text-align:center;margin-bottom:24px;">
  <button onclick="window.print()" style="background:#3b2a4a;color:#fff;border:none;padding:12px 32px;border-radius:999px;font-size:13px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;">
    ⬇ Download / Print Receipt
  </button>
</div>

<div class="receipt">
  <!-- Header -->
  <div class="header">
    <div class="brand">Reshmi Pallu</div>
    <div class="brand-tagline">Handwoven Heritage · Authentic Sarees</div>
    <div class="order-label">Order Receipt</div>
    <div class="order-number">${escapeHtml(orderNumber)}</div>
    <div class="order-date">${escapeHtml(orderDate)}</div>
    <div class="badge">✓ Payment Confirmed</div>
  </div>

  <!-- Body -->
  <div class="body">
    <!-- Customer & Address -->
    <div class="section">
      <div class="section-label">Customer Details</div>
      <div class="meta-grid">
        <div class="meta-row">
          <span class="meta-key">Email</span>
          <span class="meta-val">${escapeHtml(email)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Phone</span>
          <span class="meta-val">${escapeHtml(phone)}</span>
        </div>
        ${addr ? `
        <div class="meta-row" style="grid-column:1/-1;">
          <span class="meta-key">Shipping Address</span>
          <span class="meta-val">
            ${escapeHtml(addr.fullName)}<br/>
            ${escapeHtml(addr.line1)}${addr.line2 ? ", " + escapeHtml(addr.line2) : ""}<br/>
            ${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} – ${escapeHtml(addr.pincode)}
          </span>
        </div>` : ""}
      </div>
    </div>

    <!-- Items -->
    <div class="section">
      <div class="section-label">Items Ordered</div>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || '<tr><td colspan="3" style="padding:12px 8px;color:#aaa;font-size:13px;">No items found</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="section">
      <div class="section-label">Payment Summary</div>
      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <span>₹ ${subtotal.toLocaleString("en-IN")}</span>
        </div>
        ${shipping > 0 ? `<div class="total-row"><span>Shipping</span><span>₹ ${shipping.toLocaleString("en-IN")}</span></div>` : `<div class="total-row"><span>Shipping</span><span>Free</span></div>`}
        ${tax > 0 ? `<div class="total-row"><span>Tax</span><span>₹ ${tax.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>` : ""}
        ${discount < 0 ? `<div class="total-row" style="color:#16a34a;"><span>Discount</span><span>– ₹ ${Math.abs(discount).toLocaleString("en-IN")}</span></div>` : ""}
        <div class="total-row grand">
          <span>Total Paid</span>
          <span>₹ ${totalPaid.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>Thank you for shopping with <strong>Reshmi Pallu</strong>.</p>
    <p style="margin-top:4px;">Questions? <a href="mailto:founder@reshmipallu.com">founder@reshmipallu.com</a></p>
    <p style="margin-top:10px;font-size:10px;">
      This is a computer-generated receipt and does not require a signature.
    </p>
  </div>
</div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err: any) {
    return new NextResponse(err.message || "Failed to render receipt", { status: 500 });
  }
}
