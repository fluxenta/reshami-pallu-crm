import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { shopifySaree } from "@/lib/shopify";
import { sareeDb } from "@/lib/db";
import { 
  ShoppingBag, 
  AlertTriangle, 
  TrendingUp, 
  DollarSign, 
  Sparkles, 
  ArrowRight,
  PlusCircle,
  UploadCloud
} from "lucide-react";

export const revalidate = 0; // Disable cache so the dashboard is always live

export default async function DashboardPage() {
  let products: any[] = [];
  let totalStock = 0;
  let totalRetailValue = 0;
  let totalCostValue = 0;
  let lowStockProducts: any[] = [];
  let deadStockProducts: any[] = [];

  let freshStock = 0;
  let maturingStock = 0;
  let deadStock = 0;
  const categoryCounts: Record<string, number> = {};
  let topCategories: [string, number][] = [];
  
  try {
    // 1. Fetch products from Shopify
    const listRes = await shopifySaree.list(150);
    products = listRes.products;

    // 2. Fetch corresponding metadata from Redis
    const skus = products.map(p => p.sku).filter(Boolean);
    const metaMap = await sareeDb.mget(skus);

    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // 3. Compute stats
    products.forEach(p => {
      const stock = p.stock || 0;
      totalStock += stock;
      
      const retailPrice = p.price || 0;
      totalRetailValue += retailPrice * stock;

      const meta = metaMap[p.sku];
      if (meta) {
        totalCostValue += (meta.costPrice || 0) * stock;
      }

      if (stock < 3) {
        lowStockProducts.push({
          ...p,
          costPrice: meta?.costPrice || 0,
          margin: meta?.margin || 0
        });
      }

      const createdAtDate = p.createdAt ? new Date(p.createdAt) : null;
      if (createdAtDate && stock > 0) {
        if (createdAtDate > oneWeekAgo) {
          freshStock += stock;
        } else if (createdAtDate > oneMonthAgo) {
          maturingStock += stock;
        } else {
          deadStock += stock;
          deadStockProducts.push({
            ...p,
            ageInDays: Math.floor((Date.now() - createdAtDate.getTime()) / (1000 * 60 * 60 * 24)),
            costPrice: meta?.costPrice || 0,
            margin: meta?.margin || 0
          });
        }
      }

      // Categories
      const tags = (p.tags || []).filter((t: string) => !["Founders-Exclusive", "All Sarees", "Best Sellers", "New Arrivals"].includes(t));
      tags.forEach((tag: string) => {
         categoryCounts[tag] = (categoryCounts[tag] || 0) + 1;
      });
    });

    // Sort categories
    topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

  } catch (error) {
    console.error("Dashboard data fetching failed:", error);
  }

  const totalSareesCount = products.length;
  const netMargin = totalRetailValue > 0 
    ? ((totalRetailValue - totalCostValue) / totalRetailValue) * 100 
    : 0;

  const projectedNetProfit = totalRetailValue - totalCostValue;
  const capitalTiedUp = totalCostValue;
  const roiExpectation = totalCostValue > 0 ? (projectedNetProfit / totalCostValue) * 100 : 0;

  // Cohort percentages
  const totalStockForCohorts = freshStock + maturingStock + deadStock || 1; // avoid / 0
  const freshPct = (freshStock / totalStockForCohorts) * 100;
  const maturingPct = (maturingStock / totalStockForCohorts) * 100;
  const deadPct = (deadStock / totalStockForCohorts) * 100;

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <Header title="Workspace Overview" />

        {/* Dashboard Frame */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1360px] mx-auto w-full space-y-6 sm:space-y-8">
          
          {/* Quick Actions Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/40 border border-[#4A154B]/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-[#4A154B] flex items-center gap-2">
                <Sparkles size={18} className="text-[#D4AF37]" />
                Welcome Back, Mrinalini!
              </h3>
              <p className="text-xs text-[#1A1A1A]/60 mt-0.5">
                Ready to manage your beautiful handwoven saree catalog today?
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Link href="/products/add" className="btn-primary no-underline text-xs uppercase tracking-wider flex items-center gap-1.5 py-2.5 px-4 shadow-md">
                <PlusCircle size={14} />
                Create Saree
              </Link>
              <Link href="/bulk-upload" className="btn-secondary no-underline text-xs uppercase tracking-wider flex items-center gap-1.5 py-2.5 px-4">
                <UploadCloud size={14} />
                Bulk CSV Upload
              </Link>
            </div>
          </div>

          {/* Core Dashboard Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Unique Saree Items Card */}
            <div className="ui-card ui-card-hover p-6 flex items-center gap-4 relative overflow-hidden">
              <div className="w-12 h-12 rounded-xl bg-[#4A154B]/5 border border-[#4A154B]/10 flex items-center justify-center text-[#4A154B]">
                <ShoppingBag size={20} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Unique Saree Styles</span>
                <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-0.5">{totalSareesCount}</h4>
              </div>
              <div className="absolute -right-6 -bottom-6 text-[#4A154B] opacity-5 font-bold font-display text-7xl select-none pointer-events-none">
                #
              </div>
            </div>

            {/* Total In-Stock Items Card */}
            <div className="ui-card ui-card-hover p-6 flex items-center gap-4 relative overflow-hidden">
              <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/5 border border-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
                <TrendingUp size={20} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Total Active Stock</span>
                <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-0.5">{totalStock} sarees</h4>
              </div>
              <div className="absolute -right-6 -bottom-6 text-[#D4AF37] opacity-5 font-bold font-display text-7xl select-none pointer-events-none">
                PCS
              </div>
            </div>

            {/* Retail Catalog Value Card */}
            <div className="ui-card ui-card-hover p-6 flex items-center gap-4 relative overflow-hidden">
              <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center text-green-700">
                <DollarSign size={20} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Total Retail Value</span>
                <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-0.5">
                  ₹{totalRetailValue.toLocaleString('en-IN')}
                </h4>
              </div>
              <div className="absolute -right-6 -bottom-6 text-green-500 opacity-5 font-bold font-display text-7xl select-none pointer-events-none">
                ₹
              </div>
            </div>

            {/* Overall Profit Margin Health Card */}
            <div className="ui-card ui-card-hover p-6 flex items-center gap-4 relative overflow-hidden">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
                <TrendingUp size={20} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Est. Profit Margin</span>
                <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-0.5">
                  {netMargin.toFixed(1)}%
                </h4>
              </div>
              <div className="absolute -right-6 -bottom-6 text-blue-500 opacity-5 font-bold font-display text-7xl select-none pointer-events-none">
                %
              </div>
            </div>

          </div>

          {/* Low Stock Alert Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Side: Low Stock Table */}
            <div className="ui-card p-6 lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-display font-bold text-base text-[#4A154B] flex items-center gap-2">
                  <AlertTriangle size={16} className="text-[#D4AF37]" />
                  Stock Alert Level (Low Stock)
                </h4>
                <Link href="/products" className="no-underline text-xs text-[#4A154B] hover:underline font-semibold flex items-center gap-1">
                  View Full Grid
                  <ArrowRight size={12} />
                </Link>
              </div>

              {lowStockProducts.length === 0 ? (
                <div className="h-48 rounded-xl border border-dashed border-[#4A154B]/10 flex items-center justify-center bg-[#FAF8F5]/30">
                  <p className="text-xs text-[#1A1A1A]/40 font-medium">
                    🎉 Excellent! All active catalog items are fully stocked.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#4A154B]/10 text-[10px] uppercase tracking-wider text-[#1A1A1A]/50 font-bold">
                        <th className="pb-3">Saree Title</th>
                        <th className="pb-3">SKU</th>
                        <th className="pb-3 text-center">Current Stock</th>
                        <th className="pb-3 text-right">Retail Price</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#4A154B]/5 text-xs text-[#1A1A1A]/80">
                      {lowStockProducts.slice(0, 5).map((p) => (
                        <tr key={p.id} className="hover:bg-[#4A154B]/5 transition-colors duration-200">
                          <td className="py-3 font-semibold text-[#4A154B] max-w-[200px] truncate">
                            {p.title}
                          </td>
                          <td className="py-3 font-mono text-[11px] text-[#1A1A1A]/60">
                            {p.sku}
                          </td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              p.stock === 0 
                                ? 'bg-red-50 text-red-600 border border-red-100' 
                                : 'bg-[#D4AF37]/5 text-[#4A154B] border border-[#D4AF37]/20'
                            }`}>
                              {p.stock === 0 ? "Out of Stock" : `${p.stock} left`}
                            </span>
                          </td>
                          <td className="py-3 text-right font-medium">
                            ₹{(p.price || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 text-right">
                            <Link href={`/products/edit/${p.id.split('/').pop()}`} className="no-underline text-xs bg-[#4A154B]/5 text-[#4A154B] hover:bg-[#4A154B] hover:text-white px-2.5 py-1 rounded font-semibold transition-colors duration-200">
                              Edit Stock
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Side: Margin Analysis Visual Panel */}
            <div className="ui-card p-6 flex flex-col justify-between space-y-6">
              <div>
                <h4 className="font-display font-bold text-base text-[#4A154B]">
                  Financial Health Analysis
                </h4>
                <p className="text-xs text-[#1A1A1A]/60 mt-1">
                  Private overview comparing your retail income value to saree base cost investments.
                </p>
              </div>

              {/* Graphical Circular Progress Meter */}
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <div className="relative w-36 h-36 rounded-full border-8 border-[#4A154B]/5 flex items-center justify-center shadow-inner" style={{
                  background: `conic-gradient(#4A154B ${netMargin}%, #FAF8F5 0)`
                }}>
                  {/* Center Circle Mask */}
                  <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center shadow-lg border border-[#4A154B]/5">
                    <span className="text-xs font-semibold text-[#1A1A1A]/50 uppercase tracking-widest leading-none">Margin</span>
                    <span className="text-3xl font-display font-bold text-[#4A154B] mt-1">{netMargin.toFixed(0)}%</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#4A154B]">Est. Net Profitability</span>
              </div>

              <div className="space-y-3 border-t border-[#4A154B]/5 pt-4 text-xs text-[#1A1A1A]/70">
                <div className="flex justify-between">
                  <span>Gross Saree Costs (Capital Tied Up):</span>
                  <span className="font-semibold text-red-600">₹{capitalTiedUp.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Projected Retail Gross:</span>
                  <span className="font-semibold text-[#1A1A1A]">₹{totalRetailValue.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t border-[#4A154B]/5 pt-2 font-bold text-sm text-[#4A154B]">
                  <span>Est. Net Profit (ROI: {roiExpectation.toFixed(0)}%):</span>
                  <span className="text-green-600">₹{projectedNetProfit.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Great Analysis Dashboards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Top Categories Chart */}
            <div className="ui-card p-6 flex flex-col space-y-4">
              <h4 className="font-display font-bold text-base text-[#4A154B]">Category & Tag Distribution</h4>
              <p className="text-xs text-[#1A1A1A]/60 -mt-2 mb-2">The highest concentrated styles across your active inventory.</p>
              
              <div className="space-y-4 mt-2">
                {topCategories.map(([tag, count], index) => {
                  const maxCount = topCategories[0]?.[1] || 1;
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={tag} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-[#4A154B]">
                        <span>{tag}</span>
                        <span>{count} pcs</span>
                      </div>
                      <div className="h-2.5 w-full bg-[#FAF8F5] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#D4AF37] rounded-full transition-all duration-1000 ease-out" 
                          style={{ width: `${pct}%`, opacity: 1 - (index * 0.15) }}
                        />
                      </div>
                    </div>
                  );
                })}
                {topCategories.length === 0 && (
                  <p className="text-xs text-[#1A1A1A]/40 font-medium italic py-4">No tagged categories found.</p>
                )}
              </div>
            </div>

            {/* Age Cohorts Visualization */}
            <div className="ui-card p-6 flex flex-col space-y-4">
              <h4 className="font-display font-bold text-base text-[#4A154B]">Inventory Age Cohorts</h4>
              <p className="text-xs text-[#1A1A1A]/60 -mt-2 mb-2">Tracking inventory turnover and aging stock.</p>
              
              {/* Stacked Bar */}
              <div className="h-6 w-full flex rounded-full overflow-hidden mb-2 shadow-inner border border-soft-black/5">
                <div style={{ width: `${freshPct}%` }} className="bg-green-500 hover:opacity-90 transition-opacity" title={`Fresh Stock: ${freshStock} pcs`} />
                <div style={{ width: `${maturingPct}%` }} className="bg-[#D4AF37] hover:opacity-90 transition-opacity" title={`Maturing Stock: ${maturingStock} pcs`} />
                <div style={{ width: `${deadPct}%` }} className="bg-red-500 hover:opacity-90 transition-opacity" title={`Dead Stock: ${deadStock} pcs`} />
              </div>

              {/* Legend */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="text-center bg-green-50 rounded-lg p-2 border border-green-100">
                  <div className="text-[10px] uppercase font-bold text-green-700 tracking-wider">Fresh</div>
                  <div className="text-[10px] text-green-600/80 mb-1">&lt; 7 Days</div>
                  <div className="text-lg font-display font-bold text-green-700">{freshStock} <span className="text-[10px] font-sans font-normal opacity-70">pcs</span></div>
                </div>
                <div className="text-center bg-yellow-50 rounded-lg p-2 border border-yellow-100">
                  <div className="text-[10px] uppercase font-bold text-yellow-700 tracking-wider">Maturing</div>
                  <div className="text-[10px] text-yellow-600/80 mb-1">7 - 30 Days</div>
                  <div className="text-lg font-display font-bold text-yellow-700">{maturingStock} <span className="text-[10px] font-sans font-normal opacity-70">pcs</span></div>
                </div>
                <div className="text-center bg-red-50 rounded-lg p-2 border border-red-100">
                  <div className="text-[10px] uppercase font-bold text-red-700 tracking-wider">Dead</div>
                  <div className="text-[10px] text-red-600/80 mb-1">&gt; 30 Days</div>
                  <div className="text-lg font-display font-bold text-red-700">{deadStock} <span className="text-[10px] font-sans font-normal opacity-70">pcs</span></div>
                </div>
              </div>
            </div>

          </div>

          {/* Dead Stock Section */}
          <div className="ui-card p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-display font-bold text-base text-red-700 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 animate-pulse" />
                Dead Stock Inventory (Held &gt; 1 Month)
              </h4>
              <span className="text-xs bg-red-50 text-red-700 border border-red-100 rounded-full px-2.5 py-0.5 font-bold">
                {deadStockProducts.length} Items Identified
              </span>
            </div>

            {deadStockProducts.length === 0 ? (
              <div className="h-32 rounded-xl border border-dashed border-[#4A154B]/10 flex items-center justify-center bg-[#FAF8F5]/30">
                <p className="text-xs text-[#1A1A1A]/40 font-medium">
                  ✨ Brilliant! No sarees in inventory have been held for more than 1 month.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#4A154B]/10 text-[10px] uppercase tracking-wider text-[#1A1A1A]/50 font-bold">
                      <th className="pb-3">Saree Title</th>
                      <th className="pb-3">SKU</th>
                      <th className="pb-3 text-center">Age (Days)</th>
                      <th className="pb-3 text-center">Stock Level</th>
                      <th className="pb-3 text-right">Retail Value</th>
                      <th className="pb-3 text-right">Cost Price</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#4A154B]/5 text-xs text-[#1A1A1A]/80">
                    {deadStockProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-red-50/30 transition-colors duration-200">
                        <td className="py-3 font-semibold text-[#4A154B] max-w-[250px] truncate">
                          {p.title}
                        </td>
                        <td className="py-3 font-mono text-[11px] text-[#1A1A1A]/60">
                          {p.sku}
                        </td>
                        <td className="py-3 text-center font-bold text-red-600">
                          {p.ageInDays} days
                        </td>
                        <td className="py-3 text-center">
                          <span className="bg-[#4A154B]/5 text-[#4A154B] px-2 py-0.5 rounded font-medium">
                            {p.stock} units
                          </span>
                        </td>
                        <td className="py-3 text-right font-medium">
                          ₹{(p.price || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 text-right text-[#1A1A1A]/60">
                          ₹{(p.costPrice || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 text-right">
                          <Link href="/discounts" className="no-underline text-xs bg-red-50 text-red-700 hover:bg-red-600 hover:text-white px-2.5 py-1 rounded font-semibold transition-colors duration-200 inline-block">
                            Run Campaign
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
