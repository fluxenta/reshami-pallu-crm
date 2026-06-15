"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  Sparkles, 
  TrendingUp, 
  AlertCircle,
  FileSpreadsheet
} from "lucide-react";

interface InventoryGridProps {
  initialProducts: any[];
}

export default function InventoryGrid({ initialProducts }: InventoryGridProps) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  
  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [fabricFilter, setFabricFilter] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL");

  // Filter unique values for selector dropdowns

  const uniqueFabrics = Array.from(new Set(initialProducts.map(p => p.metafields.fabric).filter(Boolean)));

  // Delete product handler
  const handleDelete = async (id: string, sku: string) => {
    if (!confirm(`Are you absolutely sure you want to delete SKU ${sku}? This removes it from both Shopify and Redis cost databases.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/products?id=${id}&sku=${sku}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
      } else {
        alert("Delete failed");
      }
    } catch (err) {
      alert("Delete failed: " + (err as Error).message);
    }
  };

  // Filter and Search Logic
  const filteredProducts = products.filter(p => {
    // 1. Search text
    const matchesSearch = 
      p.title.toLowerCase().includes(search.toLowerCase()) || 
      p.sku.toLowerCase().includes(search.toLowerCase());

    // 2. Status
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;



    // 4. Fabric
    const matchesFabric = fabricFilter === "ALL" || p.metafields.fabric === fabricFilter;

    // 5. Stock
    const matchesStock = 
      stockFilter === "ALL" || 
      (stockFilter === "OUT" && p.stock <= 0) || 
      (stockFilter === "LOW" && p.stock > 0 && p.stock < 3) ||
      (stockFilter === "OK" && p.stock >= 3);

    return matchesSearch && matchesStatus && matchesFabric && matchesStock;
  });

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="ui-card p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <span className="absolute left-3.5 top-3 text-[#1A1A1A]/40">
              <Search size={16} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sarees by title or SKU..."
              className="glass-input pl-10 w-full"
            />
          </div>



          {/* Fabric Filter */}
          <div className="relative">
            <select
              value={fabricFilter}
              onChange={(e) => setFabricFilter(e.target.value)}
              className="glass-input w-full bg-white appearance-none pr-8"
            >
              <option value="ALL">All Fabrics</option>
              {uniqueFabrics.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Stock Filter */}
          <div className="relative">
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="glass-input w-full bg-white appearance-none pr-8"
            >
              <option value="ALL">All Stocks</option>
              <option value="OK">In Stock (3 or more)</option>
              <option value="LOW">Low Stock (1-2)</option>
              <option value="OUT">Out of Stock (0)</option>
            </select>
          </div>

        </div>

        {/* Filter Badges & Extra Settings */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-[#4A154B]/5 text-xs">
          <div className="flex items-center gap-3 text-[#1A1A1A]/60">
            <span>Showing <strong>{filteredProducts.length}</strong> of <strong>{products.length}</strong> catalog items</span>
            
            {statusFilter !== "ALL" && (
              <span className="bg-[#4A154B]/5 border border-[#4A154B]/10 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[#4A154B]">
                Status: {statusFilter}
              </span>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex border border-[#4A154B]/15 rounded-lg overflow-hidden bg-white/50">
            {["ALL", "ACTIVE", "DRAFT"].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 font-bold uppercase text-[10px] tracking-wider transition-colors cursor-pointer ${
                  statusFilter === status 
                    ? 'bg-[#4A154B] text-white' 
                    : 'text-[#4A154B] hover:bg-[#4A154B]/5'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Main Inventory Grid Grid */}
      <div className="ui-card overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <AlertCircle size={32} className="text-[#4A154B]/30 mx-auto" />
            <h4 className="text-[#4A154B] font-display font-semibold">No Sarees Found</h4>
            <p className="text-xs text-[#1A1A1A]/55 max-w-sm mx-auto">
              We couldn't find any sarees matching your search terms. Try adjusting your filter tags.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#4A154B]/10 text-[10px] uppercase tracking-wider text-[#1A1A1A]/50 font-bold bg-[#4A154B]/2 px-6 py-4">
                  <th className="p-4 pl-6">Saree Details</th>
                  <th className="p-4">SKU Code</th>
                  <th className="p-4">Specifications</th>
                  <th className="p-4 text-center">Stock</th>
                  <th className="p-4 text-right">Retail Price</th>
                  <th className="p-4 text-right">Cost (Redis)</th>
                  <th className="p-4 text-center">Margin</th>
                  <th className="p-4 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A154B]/5 text-xs text-[#1A1A1A]/80">
                {filteredProducts.map((p) => {
                  const marginPct = p.margin * 100;
                  const marginColor = 
                    marginPct >= 40 ? 'text-green-600 font-bold' : 
                    marginPct >= 20 ? 'text-yellow-600 font-semibold' : 
                    'text-red-500 font-medium';

                  return (
                    <tr key={p.id} className="hover:bg-[#4A154B]/2 transition-colors duration-150">
                      {/* Saree Details */}
                      <td className="p-4 pl-6 flex items-center gap-3">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.title} className="w-10 h-10 rounded-lg object-cover border border-[#4A154B]/10 bg-white" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#4A154B]/5 border border-[#4A154B]/10 flex items-center justify-center text-[#4A154B]/40">
                            S
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-[#4A154B] block max-w-[180px] truncate leading-tight">
                            {p.title}
                          </span>
                          <div className="flex gap-1.5 mt-1.5">
                            {p.status === "ACTIVE" ? (
                              <span className="status-pill-active">Active</span>
                            ) : (
                              <span className="status-pill-draft">Draft</span>
                            )}
                            {p.metafields.foundersExclusive && (
                              <span className="bg-[#D4AF37]/10 text-[#4A154B] border border-[#D4AF37]/20 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">
                                Exclusive
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* SKU */}
                      <td className="p-4 font-mono font-semibold text-[11px] text-[#1A1A1A]/70 select-all">
                        {p.sku}
                      </td>

                      {/* Specs */}
                      <td className="p-4 leading-normal">
                        <span className="font-medium text-[#1A1A1A]/60 block">Fabric: {p.metafields.fabric}</span>
                      </td>

                      {/* Stock */}
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] whitespace-nowrap ${
                          p.stock < 0 
                            ? 'bg-red-600 text-white border border-red-700 shadow-sm'
                            : p.stock === 0 
                            ? 'bg-red-50 text-red-600 border border-red-100' 
                            : p.stock < 3 
                            ? 'bg-[#D4AF37]/5 text-[#4A154B] border border-[#D4AF37]/20' 
                            : 'bg-green-50 text-green-700 border border-green-100'
                        }`}>
                          {p.stock < 0 ? `Oversold (${p.stock})` : p.stock === 0 ? "Out of Stock" : `${p.stock} pcs`}
                        </span>
                      </td>

                      {/* Retail Price */}
                      <td className="p-4 text-right font-semibold text-[#4A154B]">
                        ₹{p.price.toLocaleString('en-IN')}
                      </td>

                      {/* Cost Price */}
                      <td className="p-4 text-right font-medium text-[#1A1A1A]/75">
                        {p.costPrice > 0 ? `₹${p.costPrice.toLocaleString('en-IN')}` : "—"}
                      </td>

                      {/* Profit Margin */}
                      <td className="p-4 text-center">
                        <span className={marginColor}>
                          {p.costPrice > 0 ? `${marginPct.toFixed(0)}%` : "—"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right pr-6">
                        <div className="flex justify-end gap-2">
                          <Link 
                            href={`/products/edit/${p.id.split('/').pop()}`} 
                            className="p-1.5 rounded bg-white hover:bg-[#4A154B]/5 border border-[#4A154B]/15 text-[#4A154B] flex items-center justify-center shadow-sm"
                            title="Edit Saree details"
                          >
                            <Edit2 size={13} />
                          </Link>
                          <button
                            onClick={() => handleDelete(p.id, p.sku)}
                            className="p-1.5 rounded bg-white hover:bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shadow-sm cursor-pointer"
                            title="Delete saree"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
