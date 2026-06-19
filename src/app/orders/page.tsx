import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { shopifyOrder } from "@/lib/shopify";
import { sareeDb } from "@/lib/db";
import OrdersListTable from "@/components/orders/OrdersListTable";

export const revalidate = 0; // Disable next.js cache so the orders dashboard is always live

export default async function OrdersDashboardPage() {
  let orders: any[] = [];
  let metaMap: Record<string, { costPrice: number; margin: number; privateNotes?: string }> = {};

  try {
    // 1. Fetch live orders from Shopify
    orders = await shopifyOrder.list(100);

    // 2. Extract unique product variant SKUs to fetch private weaver costs from Redis
    const skusSet = new Set<string>();
    orders.forEach(order => {
      order.lineItems?.edges?.forEach((e: any) => {
        if (e.node?.sku) skusSet.add(e.node.sku);
      });
    });

    const uniqueSkus = Array.from(skusSet);
    
    // 3. Query Upstash Redis in bulk
    if (uniqueSkus.length > 0) {
      metaMap = await sareeDb.mget(uniqueSkus);
    }
  } catch (err) {
    console.error("Failed to load CRM orders dashboard data:", err);
  }

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Workspace Panel */}
      <div className="flex-1 flex flex-col min-h-screen">
        <Header title="Customer Orders & Operations" />

        <main className="flex-1 p-4 sm:p-8 pb-24 max-w-[1600px] mx-auto w-full">
          <OrdersListTable initialOrders={orders} metaMap={metaMap} />
        </main>
      </div>
    </div>
  );
}
