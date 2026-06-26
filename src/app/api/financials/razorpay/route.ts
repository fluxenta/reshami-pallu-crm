import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { razorpay } from "@/lib/razorpay";
import { shopifyOrder } from "@/lib/shopify";
import { db, sareeDb } from "@/lib/db";

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

    // Fetch combined recon data for the last 15 days to map payments to settlements
    const reconMap: Record<string, { settlementId: string; fee: number; tax: number; settledAt: string }> = {};
    const settledTransactionsBySettlement: Record<string, any[]> = {};
    
    try {
      // 1. Load all cached mappings from Redis
      const cachedRecon = await db.hgetall<Record<string, string>>("crm:razorpay:recon_hash") || {};
      const newMappingsToCache: Record<string, string> = {};

      Object.entries(cachedRecon).forEach(([txnId, serializedData]) => {
        try {
          const item = typeof serializedData === "string" ? JSON.parse(serializedData) : serializedData;
          if (item && item.settlementId) {
            reconMap[txnId] = {
              settlementId: item.settlementId,
              fee: item.fee || 0,
              tax: item.tax || 0,
              settledAt: item.settledAt,
            };

            if (!settledTransactionsBySettlement[item.settlementId]) {
              settledTransactionsBySettlement[item.settlementId] = [];
            }
            if (!settledTransactionsBySettlement[item.settlementId].some(t => t.id === txnId)) {
              settledTransactionsBySettlement[item.settlementId].push({
                id: txnId,
                type: item.type || "payment",
                amount: item.amount || 0,
                fee: item.fee || 0,
                tax: item.tax || 0,
                createdAt: item.createdAt || item.settledAt,
              });
            }
          }
        } catch (e) {
          console.error("Failed to parse cached recon entry:", txnId, serializedData);
        }
      });

      // 2. Fetch the last 15 days of recon reports from Razorpay
      const mode = process.env.RAZORPAY_MODE || "test";
      const keyId = mode === "live" ? process.env.RAZORPAY_LIVE_KEY_ID : process.env.RAZORPAY_TEST_KEY_ID;
      const keySecret = mode === "live" ? process.env.RAZORPAY_LIVE_KEY_SECRET : process.env.RAZORPAY_TEST_KEY_SECRET;
      
      if (keyId && keySecret) {
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        
        // Loop last 15 days
        const datesToFetch: { year: string; month: string; day: string }[] = [];
        for (let i = 0; i < 15; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          datesToFetch.push({
            year: d.getFullYear().toString(),
            month: String(d.getMonth() + 1).padStart(2, "0"),
            day: String(d.getDate()).padStart(2, "0"),
          });
        }
        
        await Promise.all(
          datesToFetch.map(async ({ year, month, day }) => {
            try {
              const res = await fetch(
                `https://api.razorpay.com/v1/settlements/recon/combined?year=${year}&month=${month}&day=${day}`,
                {
                  headers: {
                    Authorization: `Basic ${auth}`,
                  },
                }
              );
              if (res.ok) {
                const data = await res.json();
                const items = data.items || [];
                items.forEach((item: any) => {
                  if (item.entity_id && item.settlement_id) {
                    const txnId = item.entity_id;
                    const amountVal = (item.credit || item.debit || item.amount || 0) / 100;
                    const feeVal = (item.fee || 0) / 100;
                    const taxVal = (item.tax || 0) / 100;
                    const settledAtVal = new Date(item.settled_at * 1000).toISOString();
                    const createdAtVal = new Date(item.created_at * 1000).toISOString();
                    
                    const mapped = {
                      settlementId: item.settlement_id,
                      fee: feeVal,
                      tax: taxVal,
                      settledAt: settledAtVal,
                    };
                    reconMap[txnId] = mapped;
                    
                    if (!settledTransactionsBySettlement[item.settlement_id]) {
                      settledTransactionsBySettlement[item.settlement_id] = [];
                    }
                    if (!settledTransactionsBySettlement[item.settlement_id].some(t => t.id === txnId)) {
                      settledTransactionsBySettlement[item.settlement_id].push({
                        id: txnId,
                        type: item.type,
                        amount: amountVal,
                        fee: feeVal,
                        tax: taxVal,
                        createdAt: createdAtVal,
                      });
                    }

                    // If not in cache, prepare for writing to Redis
                    if (!cachedRecon[txnId]) {
                      newMappingsToCache[txnId] = JSON.stringify({
                        settlementId: item.settlement_id,
                        type: item.type,
                        amount: amountVal,
                        fee: feeVal,
                        tax: taxVal,
                        settledAt: settledAtVal,
                        createdAt: createdAtVal,
                      });
                    }
                  }
                });
              }
            } catch (err) {
              console.error(`Failed to fetch combined recon for date ${year}-${month}-${day}:`, err);
            }
          })
        );

        // 3. Write new mappings to Upstash Redis cache
        if (Object.keys(newMappingsToCache).length > 0) {
          await db.hset("crm:razorpay:recon_hash", newMappingsToCache);
        }
      }
    } catch (err) {
      console.error("Failed to build settlement recon mapping:", err);
    }

    // Fetch settlements from Razorpay
    let settlements: any[] = [];
    try {
      const settlementsResponse = await razorpay.settlements.all({
        count: 50,
      });
      settlements = (settlementsResponse.items || []).map((s: any) => {
        const txns = settledTransactionsBySettlement[s.id] || [];
        let computedFees = (s.fees || 0) / 100;
        let computedTax = (s.tax || 0) / 100;

        // If fees are 0 but we have transactions mapping details, sum them up
        if (computedFees === 0 && txns.length > 0) {
          computedFees = txns.reduce((acc, t) => acc + (t.fee || 0), 0);
          computedTax = txns.reduce((acc, t) => acc + (t.tax || 0), 0);
        }

        return {
          id: s.id,
          amount: s.amount / 100,
          fees: computedFees,
          tax: computedTax,
          status: s.status,
          utr: s.utr,
          createdAt: new Date(s.created_at * 1000).toISOString(),
          transactions: txns,
        };
      });
    } catch (err) {
      console.error("Failed to fetch Razorpay settlements:", err);
    }

    // Fetch customers from Razorpay
    let razorpayCustomers: any[] = [];
    try {
      const customersResponse = await razorpay.customers.all({
        count: 50,
      });
      razorpayCustomers = customersResponse.items || [];
    } catch (err) {
      console.error("Failed to fetch Razorpay customers:", err);
    }

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

      // Calculate COGS if order exists
      let cogs = 0;
      let profit = 0;
      let marginPercent = 0;
      let hasCostDetails = false;

      if (matchedOrder && matchedOrder.lineItems?.edges) {
        let orderCost = 0;
        let itemsCountWithCost = 0;
        let totalItemsCount = 0;

        matchedOrder.lineItems.edges.forEach((e: any) => {
          const item = e.node;
          if (item) {
            const quantity = item.quantity || 1;
            totalItemsCount += quantity;
            if (item.sku && metaMap[item.sku]) {
              orderCost += (metaMap[item.sku].costPrice || 0) * quantity;
              itemsCountWithCost += quantity;
            }
          }
        });

        if (totalItemsCount > 0) {
          cogs = orderCost;
          hasCostDetails = itemsCountWithCost === totalItemsCount;
          
          const netPayment = (payment.amount / 100) - (payment.fee ? payment.fee / 100 : 0) - (payment.tax ? payment.tax / 100 : 0);
          profit = netPayment - cogs;
          marginPercent = netPayment > 0 ? (profit / netPayment) * 100 : 0;
        }
      }

      const pKey = payment.id.startsWith("pay_") ? payment.id : `pay_${payment.id}`;
      const reconDetails = reconMap[payment.id] || reconMap[pKey] || null;

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
        cogs,
        profit,
        marginPercent,
        hasCostDetails,
        settlementId: reconDetails ? reconDetails.settlementId : null,
        settledAt: reconDetails ? reconDetails.settledAt : null,
      };
    });

    // Build a unified customers list from Shopify orders, Razorpay payments, and Razorpay customers
    const customerMap: Record<string, {
      name: string;
      email: string;
      contact: string;
      totalSpent: number;
      ordersCount: number;
      lastOrderDate: string;
      source: string;
    }> = {};

    // 1. Add from Shopify orders (150 orders)
    shopifyOrders.forEach((order: any) => {
      if (!order || !order.customer) return;
      const c = order.customer;
      const email = (c.email || "").toLowerCase().trim();
      const phone = c.phone || order.shippingAddress?.phone || "";
      const key = email || phone;
      if (!key) return;

      const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Customer";
      const totalVal = parseFloat(order.totalPriceSet?.presentmentMoney?.amount || "0");
      const dateStr = order.createdAt;

      if (!customerMap[key]) {
        customerMap[key] = {
          name,
          email: c.email || "N/A",
          contact: phone || "N/A",
          totalSpent: 0,
          ordersCount: 0,
          lastOrderDate: dateStr,
          source: "Shopify",
        };
      }

      customerMap[key].totalSpent += totalVal;
      customerMap[key].ordersCount += 1;
      if (new Date(dateStr) > new Date(customerMap[key].lastOrderDate)) {
        customerMap[key].lastOrderDate = dateStr;
      }
    });

    // 2. Add/Merge from Razorpay payments
    payments.forEach((p: any) => {
      if (p.status !== "captured") return;
      const email = (p.email || "").toLowerCase().trim();
      const contact = p.contact || "";
      const key = (email && email !== "n/a") ? email : contact;
      if (!key || key === "void@razorpay.com") return;

      let name = "Customer";
      if (p.shopifyOrder?.customer) {
        const c = p.shopifyOrder.customer;
        name = `${c.firstName || ""} ${c.lastName || ""}`.trim();
      } else if (p.description && !p.description.includes("Payment")) {
        name = p.description.split("(")[0].trim();
      }

      if (!customerMap[key]) {
        customerMap[key] = {
          name: name || "Customer",
          email: p.email || "N/A",
          contact: p.contact || "N/A",
          totalSpent: p.amount,
          ordersCount: 1,
          lastOrderDate: p.createdAt,
          source: "Razorpay",
        };
      } else {
        // If the Shopify order already added it, we don't want to double count the LTV
        if (!p.shopifyOrderName) {
          customerMap[key].totalSpent += p.amount;
          customerMap[key].ordersCount += 1;
        }
        if (name && name !== "Customer") {
          customerMap[key].name = name;
        }
        if (new Date(p.createdAt) > new Date(customerMap[key].lastOrderDate)) {
          customerMap[key].lastOrderDate = p.createdAt;
        }
      }
    });

    // 3. Add/Merge from Razorpay customers list
    razorpayCustomers.forEach((rc: any) => {
      const email = (rc.email || "").toLowerCase().trim();
      const contact = rc.contact || "";
      const key = email || contact;
      if (!key) return;

      if (customerMap[key]) {
        if ((customerMap[key].name === "Customer" || !customerMap[key].name) && rc.name) {
          customerMap[key].name = rc.name;
        }
      } else {
        customerMap[key] = {
          name: rc.name || "Customer",
          email: rc.email || "N/A",
          contact: rc.contact || "N/A",
          totalSpent: 0,
          ordersCount: 0,
          lastOrderDate: new Date(rc.created_at * 1000).toISOString(),
          source: "Razorpay Directory",
        };
      }
    });

    const unifiedCustomers = Object.values(customerMap).sort((a, b) => b.totalSpent - a.totalSpent);

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

    // Fetch Banking Balances
    let balances: any[] = [];
    try {
      const mode = process.env.RAZORPAY_MODE || "test";
      const keyId = mode === "live" ? process.env.RAZORPAY_LIVE_KEY_ID : process.env.RAZORPAY_TEST_KEY_ID;
      const keySecret = mode === "live" ? process.env.RAZORPAY_LIVE_KEY_SECRET : process.env.RAZORPAY_TEST_KEY_SECRET;
      if (keyId && keySecret) {
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        const res = await fetch("https://api.razorpay.com/v1/banking_balances", {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          balances = (data.items || []).map((b: any) => ({
            accountNumber: b.account_number,
            accountType: b.account_type,
            bankName: b.bank_name || "Razorpay Wallet",
            bankCode: b.bank_code || b.bank || "",
            currency: b.currency,
            amount: b.amount / 100, // convert paise to INR
            availableAmount: b.available_amount / 100,
            refreshedAt: b.refreshed_at ? new Date(b.refreshed_at * 1000).toISOString() : null,
          }));
        }
      }
    } catch (err) {
      console.error("Failed to fetch banking balances:", err);
    }

    return NextResponse.json({
      success: true,
      payments,
      settlements,
      customers: unifiedCustomers,
      balances,
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
