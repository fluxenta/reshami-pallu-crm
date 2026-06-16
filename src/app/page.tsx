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
  UploadCloud,
  FileText,
  Percent,
  Bookmark,
  Calendar,
  Layers
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
      if (p.metafields?.fabric) {
        const fabric = p.metafields.fabric.trim();
        if (fabric && fabric.toLowerCase() !== 'nil') {
          categoryCounts[fabric] = (categoryCounts[fabric] || 0) + 1;
        }
      }

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
        <Header title="Saree Curation Center" />

        {/* Dashboard Frame */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1360px] mx-auto w-full space-y-6 sm:space-y-8">
          
          {/* Re-designed Premium Welcome & Quick Actions Bar */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#4A154B] via-[#6B3B6C] to-[#4A154B] border border-[#D4AF37]/20 p-6 sm:p-8 shadow-xl text-white">
            {/* Background luxury overlay */}
            <div className="absolute right-0 top-0 w-96 h-96 bg-radial-gradient from-[#D4AF37]/10 to-transparent opacity-60 pointer-events-none select-none" />
            
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-[#D4AF37]">
                  <Sparkles size={12} className="animate-pulse" />
                  <span>Reshmi Pallu Master Room</span>
                </div>
                <h3 className="font-display font-bold text-2xl sm:text-3xl text-white tracking-wide">
                  Namaste, Mrinalini!
                </h3>
                <p className="text-sm text-white/80 max-w-xl">
                  Welcome back to your curation suite. Let&apos;s manage your beautiful, handwoven luxury sarees and refresh your storefront today.
                </p>
              </div>
            </div>

            {/* Premium quick shortcut grids designed for non-technical users */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10">
              <Link href="/orders" className="group flex flex-col p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[#D4AF37]/50 hover:bg-white/10 transition-all duration-300 no-underline text-white">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-300 mb-3 group-hover:scale-110 transition-transform">
                  <FileText size={20} />
                </div>
                <span className="text-xs font-bold tracking-wide">Manage Orders</span>
                <span className="text-[10px] text-white/60 mt-1">Fulfill orders & schedule logistics runs</span>
              </Link>

              <Link href="/products/add" className="group flex flex-col p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[#D4AF37]/50 hover:bg-white/10 transition-all duration-300 no-underline text-white">
                <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] mb-3 group-hover:scale-110 transition-transform">
                  <PlusCircle size={20} />
                </div>
                <span className="text-xs font-bold tracking-wide">Add a Saree</span>
                <span className="text-[10px] text-white/60 mt-1">Design a new saree style & push to shop</span>
              </Link>

              <Link href="/bulk-upload" className="group flex flex-col p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[#D4AF37]/50 hover:bg-white/10 transition-all duration-300 no-underline text-white">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-300 mb-3 group-hover:scale-110 transition-transform">
                  <UploadCloud size={20} />
                </div>
                <span className="text-xs font-bold tracking-wide">Bulk CSV Import</span>
                <span className="text-[10px] text-white/60 mt-1">Import multiple sarees instantly in one go</span>
              </Link>

              <Link href="/discounts" className="group flex flex-col p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[#D4AF37]/50 hover:bg-white/10 transition-all duration-300 no-underline text-white">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-300 mb-3 group-hover:scale-110 transition-transform">
                  <Percent size={20} />
                </div>
                <span className="text-xs font-bold tracking-wide">Deals & Coupons</span>
                <span className="text-[10px] text-white/60 mt-1">Launch discounts & clear aging inventory</span>
              </Link>
            </div>
          </div>

          {/* Active Showroom Gallery */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <div>
                <h4 className="font-display font-bold text-lg text-[#4A154B] flex items-center gap-2">
                  <Layers size={18} className="text-[#D4AF37]" />
                  Active Showroom Gallery
                </h4>
                <p className="text-xs text-[#1A1A1A]/60">Click on any saree card to view detail grid or edit stock levels.</p>
              </div>
              <Link href="/products" className="no-underline text-xs text-[#4A154B] hover:text-[#D4AF37] font-bold flex items-center gap-1 transition-colors">
                Open Full Catalog Grid
                <ArrowRight size={12} />
              </Link>
            </div>

            {/* Desktop: Grid Layout | Mobile: Swipeable Scroll List */}
            <div className="w-full">
              {/* Desktop view: 4 Columns Grid */}
              <div className="hidden md:grid md:grid-cols-4 gap-6">
                {products.slice(0, 8).map((p) => (
                  <div 
                    key={p.id} 
                    className="bg-white border border-[#4A154B]/10 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-[#D4AF37]/50 transition-all duration-300 group flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="w-full h-48 rounded-xl bg-gradient-to-tr from-[#FAF8F5] to-white overflow-hidden relative border border-[#4A154B]/5">
                        {p.imageUrl ? (
                          <img 
                            src={p.imageUrl} 
                            alt={p.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-[#4A154B]/30 gap-1.5 p-4">
                            <ShoppingBag size={24} />
                            <span className="text-[9px] uppercase tracking-wider font-semibold">No Image</span>
                          </div>
                        )}
                        <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                          p.stock === 0
                            ? 'bg-red-50 text-red-600 border-red-100'
                            : p.stock < 3
                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                            : 'bg-green-50 text-green-700 border-green-100'
                        }`}>
                          {p.stock === 0 ? "Out of Stock" : `${p.stock} units`}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <h5 className="font-semibold text-xs text-[#4A154B] line-clamp-1 group-hover:text-[#D4AF37] transition-colors">
                          {p.title}
                        </h5>
                        <span className="text-[10px] font-mono text-[#1A1A1A]/40 block">SKU: {p.sku || "N/A"}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-[#4A154B]/5">
                      <span className="text-xs font-bold text-[#4A154B]">₹{(p.price || 0).toLocaleString('en-IN')}</span>
                      <Link href={`/products/edit/${p.id.split('/').pop()}`} className="no-underline text-[10px] uppercase font-bold tracking-wider text-[#D4AF37] hover:text-[#4A154B] transition-colors">
                        Edit
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile View: Swipeable Horizontal Carousel */}
              <div className="md:hidden flex gap-4 overflow-x-auto pb-4 pt-1 snap-x scrollbar-thin scroll-smooth">
                {products.slice(0, 8).map((p) => (
                  <div 
                    key={p.id} 
                    className="snap-start shrink-0 w-48 bg-white border border-[#4A154B]/10 rounded-2xl p-3 shadow-sm hover:shadow-md hover:border-[#D4AF37]/50 transition-all duration-300 group flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="w-full h-44 rounded-xl bg-gradient-to-tr from-[#FAF8F5] to-white overflow-hidden relative border border-[#4A154B]/5">
                        {p.imageUrl ? (
                          <img 
                            src={p.imageUrl} 
                            alt={p.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-[#4A154B]/30 gap-1.5 p-4">
                            <ShoppingBag size={24} />
                            <span className="text-[9px] uppercase tracking-wider font-semibold">No Image</span>
                          </div>
                        )}
                        <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                          p.stock === 0
                            ? 'bg-red-50 text-red-600 border-red-100'
                            : p.stock < 3
                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                            : 'bg-green-50 text-green-700 border-green-100'
                        }`}>
                          {p.stock === 0 ? "Out of Stock" : `${p.stock} units`}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <h5 className="font-semibold text-xs text-[#4A154B] line-clamp-1 group-hover:text-[#D4AF37] transition-colors">
                          {p.title}
                        </h5>
                        <span className="text-[10px] font-mono text-[#1A1A1A]/40 block">SKU: {p.sku || "N/A"}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-[#4A154B]/5">
                      <span className="text-xs font-bold text-[#4A154B]">₹{(p.price || 0).toLocaleString('en-IN')}</span>
                      <Link href={`/products/edit/${p.id.split('/').pop()}`} className="no-underline text-[10px] uppercase font-bold tracking-wider text-[#D4AF37] hover:text-[#4A154B] transition-colors">
                        Edit
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {products.length === 0 && (
                <div className="w-full h-32 rounded-2xl border border-dashed border-[#4A154B]/10 flex flex-col items-center justify-center bg-white/40">
                  <p className="text-xs text-[#1A1A1A]/40 font-medium">
                    No sarees in catalog. Let&apos;s add some designs to get started!
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Redesigned Metric Cards with conversational tooltip guides */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Unique Saree Items Card */}
            <div className="ui-card ui-card-hover p-6 flex items-center gap-4 relative overflow-hidden">
              <div className="w-12 h-12 rounded-xl bg-[#4A154B]/5 border border-[#4A154B]/10 flex items-center justify-center text-[#4A154B]">
                <ShoppingBag size={20} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center">
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Unique Saree Designs</span>
                  {/* conversational CSS tooltip */}
                  <div className="group relative cursor-pointer ml-1.5 inline-block text-[#1A1A1A]/40 hover:text-[#4A154B]">
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-current text-[9px] font-bold">i</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-[#4A154B] text-white text-[10px] font-medium rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 leading-relaxed text-center">
                      The total number of unique handwoven designs you have created and cataloged.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#4A154B]" />
                    </div>
                  </div>
                </div>
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
              <div className="relative z-10">
                <div className="flex items-center">
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Showroom Stock Count</span>
                  <div className="group relative cursor-pointer ml-1.5 inline-block text-[#1A1A1A]/40 hover:text-[#4A154B]">
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-current text-[9px] font-bold">i</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-[#4A154B] text-white text-[10px] font-medium rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 leading-relaxed text-center">
                      The physical count of saree pieces currently in stock and ready to ship.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#4A154B]" />
                    </div>
                  </div>
                </div>
                <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-0.5">{totalStock} pieces</h4>
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
              <div className="relative z-10">
                <div className="flex items-center">
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Estimated Catalog Value</span>
                  <div className="group relative cursor-pointer ml-1.5 inline-block text-[#1A1A1A]/40 hover:text-[#4A154B]">
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-current text-[9px] font-bold">i</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-[#4A154B] text-white text-[10px] font-medium rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 leading-relaxed text-center">
                      The total potential revenue you will make if you sell all active catalog stock.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#4A154B]" />
                    </div>
                  </div>
                </div>
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
              <div className="relative z-10">
                <div className="flex items-center">
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Average Markup Health</span>
                  <div className="group relative cursor-pointer ml-1.5 inline-block text-[#1A1A1A]/40 hover:text-[#4A154B]">
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-current text-[9px] font-bold">i</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-[#4A154B] text-white text-[10px] font-medium rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 leading-relaxed text-center">
                      Your average profit percentage margins. Shows the health gap between production cost and retail price.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#4A154B]" />
                    </div>
                  </div>
                </div>
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
                  Stock Alerts (Items running low)
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
                <div className="w-full">
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
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

                  {/* Mobile Lite Card-Based View */}
                  <div className="flex flex-col space-y-2 md:hidden">
                    {lowStockProducts.slice(0, 5).map((p) => (
                      <div key={p.id} className="p-3.5 rounded-xl border border-[#4A154B]/5 bg-[#FAF8F5]/30 flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-xs text-[#4A154B] truncate max-w-[150px]">{p.title}</span>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                            p.stock === 0 
                              ? 'bg-red-50 text-red-600 border border-red-100' 
                              : 'bg-[#D4AF37]/5 text-[#4A154B] border border-[#D4AF37]/20'
                          }`}>
                            {p.stock === 0 ? "Out of Stock" : `${p.stock} left`}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-[#1A1A1A]/60">
                          <span>SKU: <span className="font-mono">{p.sku}</span></span>
                          <span className="font-medium text-[#1A1A1A]">₹{(p.price || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="pt-2 border-t border-[#4A154B]/5 flex justify-end">
                          <Link href={`/products/edit/${p.id.split('/').pop()}`} className="no-underline text-[10px] bg-[#4A154B]/5 text-[#4A154B] hover:bg-[#4A154B] hover:text-white px-2.5 py-1 rounded-lg font-bold transition-all">
                            Edit Stock
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Side: Margin Analysis Visual Panel - Redesigned to be friendly */}
            <div className="ui-card p-6 flex flex-col justify-between space-y-6">
              <div>
                <h4 className="font-display font-bold text-base text-[#4A154B]">
                  Financial Health Overview
                </h4>
                <p className="text-xs text-[#1A1A1A]/60 mt-1">
                  Comparing your retail valuation to what you spent to produce/acquire these sarees.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center py-4 space-y-1">
                <span className="text-4xl font-display font-bold text-[#4A154B]">{netMargin.toFixed(0)}%</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">Average Profitability Markup</span>
              </div>

              <div className="space-y-3 border-t border-[#4A154B]/5 pt-4 text-xs text-[#1A1A1A]/70">
                <div className="flex justify-between items-center">
                  <span className="flex items-center">
                    Inventory Investment
                    <div className="group relative cursor-pointer ml-1 text-[#1A1A1A]/40 hover:text-[#4A154B]">
                      <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-current text-[8px] font-bold">?</span>
                      <div className="absolute bottom-full right-0 mb-2 w-44 p-2 bg-[#4A154B] text-white text-[9px] font-medium rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 leading-relaxed text-center">
                        Total money spent to create or acquire these physical sarees.
                        <div className="absolute top-full right-4 border-4 border-transparent border-t-[#4A154B]" />
                      </div>
                    </div>
                  </span>
                  <span className="font-semibold text-red-600">₹{capitalTiedUp.toLocaleString('en-IN')}</span>
                </div>
                
                <div className="flex justify-between">
                  <span>Projected Retail Gross:</span>
                  <span className="font-semibold text-[#1A1A1A]">₹{totalRetailValue.toLocaleString('en-IN')}</span>
                </div>
                
                <div className="flex justify-between border-t border-[#4A154B]/5 pt-2 font-bold text-sm text-[#4A154B] items-center">
                  <span className="flex items-center">
                    Estimated Profit
                    <div className="group relative cursor-pointer ml-1 text-[#1A1A1A]/40 hover:text-[#4A154B]">
                      <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-current text-[8px] font-bold">?</span>
                      <div className="absolute bottom-full right-0 mb-2 w-44 p-2 bg-[#4A154B] text-white text-[9px] font-medium rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 leading-relaxed text-center">
                        Pure net earnings when all sarees sell (ROI: {roiExpectation.toFixed(0)}%).
                        <div className="absolute top-full right-4 border-4 border-transparent border-t-[#4A154B]" />
                      </div>
                    </div>
                  </span>
                  <span className="text-green-600">₹{projectedNetProfit.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Great Analysis Dashboards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Top Categories Chart */}
            <div className="ui-card p-6 flex flex-col space-y-4">
              <h4 className="font-display font-bold text-base text-[#4A154B]">Saree Fabrics & Tag Distribution</h4>
              <p className="text-xs text-[#1A1A1A]/60 -mt-2 mb-2">The highest concentrated styles across your active catalog.</p>
              
              <div className="space-y-4 mt-2">
                {topCategories.map(([tag, count], index) => {
                  const maxCount = topCategories[0]?.[1] || 1;
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={tag} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-[#4A154B]">
                        <span>{tag}</span>
                        <span>{count} pieces</span>
                      </div>
                      <div className="h-2.5 w-full bg-[#FAF8F5] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#D4AF37] to-[#4A154B] rounded-full transition-all duration-1000 ease-out" 
                          style={{ width: `${pct}%`, opacity: 1 - (index * 0.12) }}
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
              <h4 className="font-display font-bold text-base text-[#4A154B]">Inventory Flow & Aging Stock</h4>
              <p className="text-xs text-[#1A1A1A]/60 -mt-2 mb-2">Tracking catalog turnover speed to avoid stale designs.</p>
              
              {/* Stacked Bar */}
              <div className="h-6 w-full flex rounded-full overflow-hidden mb-2 shadow-inner border border-soft-black/5">
                <div style={{ width: `${freshPct}%` }} className="bg-green-500 hover:opacity-90 transition-opacity" title={`Fresh Stock: ${freshStock} pcs`} />
                <div style={{ width: `${maturingPct}%` }} className="bg-[#D4AF37] hover:opacity-90 transition-opacity" title={`Maturing Stock: ${maturingStock} pcs`} />
                <div style={{ width: `${deadPct}%` }} className="bg-red-500 hover:opacity-90 transition-opacity" title={`Dead Stock: ${deadStock} pcs`} />
              </div>

              {/* Legend */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="text-center bg-green-50 rounded-xl p-2.5 border border-green-100">
                  <div className="text-[10px] uppercase font-bold text-green-700 tracking-wider">Fresh Arrivals</div>
                  <div className="text-[9px] text-green-600/80 mb-1">&lt; 7 Days old</div>
                  <div className="text-lg font-display font-bold text-green-700">{freshStock} <span className="text-[10px] font-sans font-normal opacity-70">pcs</span></div>
                </div>
                <div className="text-center bg-yellow-50 rounded-xl p-2.5 border border-yellow-100">
                  <div className="text-[10px] uppercase font-bold text-yellow-700 tracking-wider">maturing stock</div>
                  <div className="text-[9px] text-yellow-600/80 mb-1">7 - 30 Days old</div>
                  <div className="text-lg font-display font-bold text-yellow-700">{maturingStock} <span className="text-[10px] font-sans font-normal opacity-70">pcs</span></div>
                </div>
                <div className="text-center bg-red-50 rounded-xl p-2.5 border border-red-100">
                  <div className="text-[10px] uppercase font-bold text-red-700 tracking-wider">slow-moving</div>
                  <div className="text-[9px] text-red-600/80 mb-1">&gt; 30 Days old</div>
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
                Slow-moving Sarees (Held for more than 1 month)
              </h4>
              <span className="text-xs bg-red-50 text-red-700 border border-red-100 rounded-full px-2.5 py-0.5 font-bold">
                {deadStockProducts.length} Items Need Clearance
              </span>
            </div>

            {deadStockProducts.length === 0 ? (
              <div className="h-32 rounded-xl border border-dashed border-[#4A154B]/10 flex items-center justify-center bg-[#FAF8F5]/30">
                <p className="text-xs text-[#1A1A1A]/40 font-medium">
                  ✨ Brilliant! No sarees in inventory have been held for more than 1 month.
                </p>
              </div>
            ) : (
              <div className="w-full">
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
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

                {/* Mobile Lite Card View */}
                <div className="flex flex-col space-y-2 md:hidden">
                  {deadStockProducts.map((p) => (
                    <div key={p.id} className="p-3.5 rounded-xl border border-red-100 bg-red-50/10 flex flex-col gap-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-semibold text-xs text-[#4A154B] truncate max-w-[150px]">{p.title}</span>
                        <span className="text-[10px] font-bold text-red-600 shrink-0">{p.ageInDays} days old</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-[#1A1A1A]/60">
                        <span>SKU: <span className="font-mono">{p.sku}</span></span>
                        <span>Stock: <span className="font-semibold text-[#4A154B]">{p.stock} units</span></span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] border-t border-[#4A154B]/5 pt-2 mt-1">
                        <div>
                          <span className="text-[#1A1A1A]/50">Retail: </span>
                          <span className="font-bold text-[#4A154B]">₹{(p.price || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <Link href="/discounts" className="no-underline text-[10px] bg-red-50 text-red-700 hover:bg-red-600 hover:text-white px-2.5 py-1 rounded-lg font-bold transition-all">
                          Campaign
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
