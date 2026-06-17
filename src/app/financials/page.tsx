"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import OrderDetailModal from "@/components/orders/OrderDetailModal";
import { 
  Sparkles, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight, 
  Activity, 
  Calendar, 
  FileText, 
  IndianRupee, 
  Loader2, 
  RefreshCw, 
  Search, 
  AlertCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface Payment {
  id: string;
  amount: number;
  fee: number;
  tax: number;
  status: string;
  method: string;
  email: string;
  contact: string;
  createdAt: string;
  orderId: string;
  description: string;
  shopifyOrderName: string | null;
  shopifyOrder?: any;
}

interface Summary {
  totalCaptured: number;
  totalFees: number;
  totalRefunded: number;
  totalFailed: number;
}

function getEstimatedSettlementDate(createdAtStr: string): string {
  const date = new Date(createdAtStr);
  let daysAdded = 0;
  while (daysAdded < 2) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) { // Skip Saturday (6) and Sunday (0)
      daysAdded++;
    }
  }
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getEstimatedFeeAndTax(amount: number, method: string): number {
  let percentage = 0.02; // Standard 2%
  const methodLower = (method || "").toLowerCase();
  if (
    methodLower.includes("emi") ||
    methodLower.includes("international") ||
    methodLower.includes("diners") ||
    methodLower.includes("amex")
  ) {
    percentage = 0.03; // 3% for EMI/Amex/International
  }
  const fee = amount * percentage;
  const tax = fee * 0.18; // 18% GST on the fee
  return fee + tax;
}

export default function RazorpayFinancialsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalCaptured: 0,
    totalFees: 0,
    totalRefunded: 0,
    totalFailed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFailedCollapsed, setIsFailedCollapsed] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [metaMap, setMetaMap] = useState<Record<string, any>>({});

  async function loadRazorpayData() {
    try {
      const res = await fetch("/api/financials/razorpay");
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
        if (data.summary) {
          setSummary(data.summary);
        }
        if (data.metaMap) {
          setMetaMap(data.metaMap);
        }
      }
    } catch (err) {
      console.error("Failed to load Razorpay transaction history:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadRazorpayData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadRazorpayData();
  };

  const filteredPayments = payments.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      p.id.toLowerCase().includes(query) ||
      p.orderId.toLowerCase().includes(query) ||
      (p.shopifyOrderName && p.shopifyOrderName.toLowerCase().includes(query)) ||
      p.email.toLowerCase().includes(query) ||
      p.contact.toLowerCase().includes(query) ||
      p.status.toLowerCase().includes(query) ||
      p.method.toLowerCase().includes(query)
    );
  });

  const getStatusBadgeStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case "captured":
        return "bg-green-50 text-green-700 border border-green-200";
      case "failed":
        return "bg-red-50 text-red-700 border border-red-200";
      case "refunded":
        return "bg-amber-50 text-amber-700 border border-amber-200";
      case "authorized":
        return "bg-blue-50 text-blue-700 border border-blue-200";
      default:
        return "bg-gray-50 text-gray-700 border border-gray-200";
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const capturedOrRefundedPayments = payments.filter(p => p.status === "captured" || p.status === "refunded");
  const computedTotalFees = capturedOrRefundedPayments.reduce((acc, p) => {
    return acc + (p.fee > 0 ? p.fee : getEstimatedFeeAndTax(p.amount, p.method));
  }, 0);
  const computedNet = summary.totalCaptured - computedTotalFees - summary.totalRefunded;
  const hasEstimatedFees = capturedOrRefundedPayments.some(p => p.fee === 0);

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Razorpay Financials" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1200px] mx-auto w-full space-y-6 sm:space-y-8">
          
          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Total collections */}
            <div className="ui-card p-5 relative overflow-hidden bg-white/85">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center text-green-600">
                  <ArrowUpRight size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Gross Collected</span>
                  <h4 className="text-xl font-display font-bold text-[#4A154B] mt-0.5">
                    ₹{summary.totalCaptured.toLocaleString("en-IN")}
                  </h4>
                </div>
              </div>
            </div>

            {/* Gateway Fees */}
            <div className="ui-card p-5 relative overflow-hidden bg-white/85">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
                  <ArrowDownRight size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Fees & Tax</span>
                  <h4 className="text-xl font-display font-bold text-[#4A154B] mt-0.5 flex items-end gap-1.5">
                    ₹{computedTotalFees.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                    {hasEstimatedFees && <span className="text-[10px] font-normal text-amber-600 mb-1" title="Includes estimated pending fees">(Est.)</span>}
                  </h4>
                </div>
              </div>
            </div>

            {/* Refunds */}
            <div className="ui-card p-5 relative overflow-hidden bg-white/85">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                  <RefreshCw size={16} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Total Refunded</span>
                  <h4 className="text-xl font-display font-bold text-[#4A154B] mt-0.5">
                    ₹{summary.totalRefunded.toLocaleString("en-IN")}
                  </h4>
                </div>
              </div>
            </div>

            {/* Net Collections */}
            <div className="ui-card p-5 relative overflow-hidden bg-purple-50/50 border-purple-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Activity size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Net Settlements</span>
                  <h4 className="text-xl font-display font-bold text-[#4A154B] mt-0.5 flex items-end gap-1.5">
                    ₹{computedNet.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                    {hasEstimatedFees && <span className="text-[10px] font-normal text-amber-600 mb-1" title="Includes estimated pending fees">(Est.)</span>}
                  </h4>
                </div>
              </div>
            </div>

          </div>

          {/* Main Content Box */}
          <div className="bg-white rounded-2xl border border-[#4A154B]/8 shadow-sm overflow-hidden space-y-4 p-5 sm:p-6">
            
            {/* Search and Table header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[#1A1A1A]/80 uppercase tracking-widest">
                  Payment History
                </span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Search orders, phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-9 pl-9 pr-4 rounded-full border border-[#1A1A1A]/10 bg-[#FAF8F5]/50 text-xs outline-none focus:border-[#4A154B]/30 focus:ring-1 focus:ring-[#4A154B]/10 transition-all text-[#1A1A1A]/80"
                  />
                  <Search size={14} className="absolute left-3.5 top-2.5 text-[#1A1A1A]/40" />
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing || isLoading}
                  className="p-2 rounded-full text-[#1A1A1A]/40 hover:bg-[#1A1A1A]/5 hover:text-[#1A1A1A]/80 transition-colors cursor-pointer disabled:opacity-50"
                  title="Refresh Data"
                >
                  <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Payments Table */}
            {isLoading ? (
              <div className="p-16 text-center space-y-3">
                <Loader2 className="animate-spin text-[#4A154B] mx-auto" size={28} />
                <p className="text-xs text-[#1A1A1A]/55">Fetching transaction feed from Razorpay API...</p>
              </div>
            ) : (() => {
              const capturedPayments = filteredPayments.filter(p => p.status === "captured" || p.status === "refunded");
              const failedPayments = filteredPayments.filter(p => p.status === "failed");

              return (
                <div className="space-y-6">
                  {/* Main Captured Payments Table */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-green-700 tracking-wider block px-1">
                      Successful Collections ({capturedPayments.length})
                    </span>
                    {capturedPayments.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#1A1A1A]/50 bg-[#FAF8F5] rounded-xl border border-dashed border-[#1A1A1A]/10">
                        No captured transactions found matching search.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-[#1A1A1A]/5 text-[10px] uppercase tracking-widest text-[#1A1A1A]/40 font-semibold">
                              <th className="py-4 px-4 font-medium text-left">Order</th>
                              <th className="py-4 px-4 font-medium text-left">Time</th>
                              <th className="py-4 px-4 font-medium text-center">Method</th>
                              <th className="py-4 px-4 font-medium text-left">Est. Settlement</th>
                              <th className="py-4 px-4 font-medium text-right">Fee</th>
                              <th className="py-4 px-4 font-medium text-center">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="text-[#1A1A1A]/80">
                            {capturedPayments.map((p) => (
                              <tr key={p.id} className="hover:bg-[#1A1A1A]/[0.02] transition-colors border-b border-[#1A1A1A]/[0.02] last:border-none group">
                                <td className="py-4 px-4">
                                  {p.shopifyOrderName ? (
                                    <button 
                                      onClick={() => {
                                        if (p.shopifyOrder) {
                                          setSelectedOrder(p.shopifyOrder);
                                        } else {
                                          alert("Order details not loaded yet.");
                                        }
                                      }}
                                      className="inline-block text-[#4A154B] font-bold text-[11px] uppercase underline underline-offset-4 decoration-[#4A154B]/30 hover:decoration-[#4A154B] hover:text-[#D4AF37] transition-all cursor-pointer"
                                    >
                                      {p.shopifyOrderName}
                                    </button>
                                  ) : (
                                    <span className="text-[#1A1A1A]/30 italic font-normal">Unmapped</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 whitespace-nowrap">
                                  <span className="text-[#1A1A1A]/60">
                                    {formatDateTime(p.createdAt)}
                                  </span>
                                </td>
                                <td className="py-4 px-4 text-center uppercase text-[10px] text-[#1A1A1A]/50 tracking-widest">
                                  {p.method}
                                </td>
                                <td className="py-4 px-4 font-medium text-[#1A1A1A]/60 whitespace-nowrap">
                                  {getEstimatedSettlementDate(p.createdAt)}
                                </td>
                                <td className="py-4 px-4 text-right text-[#1A1A1A]/50">
                                  {p.fee > 0 ? (
                                    `₹${p.fee.toFixed(2)}`
                                  ) : (
                                    <span className="text-amber-600/80 italic text-[11px]" title="Estimated based on method">
                                      ₹{getEstimatedFeeAndTax(p.amount, p.method).toFixed(2)} (Est.)
                                    </span>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-center font-medium text-[13px] text-[#1A1A1A]/90">
                                  ₹{p.amount.toLocaleString("en-IN")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Collapsible Failed Payments Table */}
                  <div className="border-t border-[#4A154B]/10 pt-4 space-y-2">
                    <button
                      onClick={() => setIsFailedCollapsed(!isFailedCollapsed)}
                      className="flex items-center justify-between w-full p-3 bg-red-50/40 border border-red-150/40 rounded-xl text-left hover:bg-red-50/70 transition-colors cursor-pointer"
                    >
                      <span className="text-[10px] uppercase font-bold text-red-700 tracking-wider flex items-center gap-1.5">
                        <AlertCircle size={12} />
                        Failed Transactions ({failedPayments.length})
                      </span>
                      {isFailedCollapsed ? (
                        <ChevronDown size={16} className="text-red-700" />
                      ) : (
                        <ChevronUp size={16} className="text-red-700" />
                      )}
                    </button>

                    {!isFailedCollapsed && (
                      <div className="mt-2">
                        {failedPayments.length === 0 ? (
                          <div className="p-8 text-center text-xs text-[#1A1A1A]/50 bg-[#FAF8F5] rounded-xl border border-dashed border-[#1A1A1A]/10">
                            No failed transactions found matching search.
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-red-150/20 rounded-xl">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-[#1A1A1A]/5 text-[10px] uppercase tracking-widest text-[#1A1A1A]/40 font-semibold">
                                  <th className="py-4 px-4 font-medium text-left">Order</th>
                                  <th className="py-4 px-4 font-medium text-left">Time</th>
                                  <th className="py-4 px-4 font-medium text-center">Method</th>
                                  <th className="py-4 px-4 font-medium text-right">Fee</th>
                                  <th className="py-4 px-4 font-medium text-center">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="text-red-900/90">
                                {failedPayments.map((p) => (
                                  <tr key={p.id} className="hover:bg-red-50/20 transition-colors border-b border-[#1A1A1A]/[0.02] last:border-none group">
                                    <td className="py-4 px-4">
                                      {p.shopifyOrderName ? (
                                        <button 
                                          onClick={() => {
                                            if (p.shopifyOrder) {
                                              setSelectedOrder(p.shopifyOrder);
                                            } else {
                                              alert("Order details not loaded yet.");
                                            }
                                          }}
                                          className="inline-block text-red-700 font-bold text-[11px] uppercase underline underline-offset-4 decoration-red-700/30 hover:decoration-red-700 hover:text-red-900 transition-all cursor-pointer"
                                        >
                                          {p.shopifyOrderName}
                                        </button>
                                      ) : (
                                        <span className="text-red-700/40 italic font-normal">Unmapped</span>
                                      )}
                                    </td>
                                    <td className="py-4 px-4 whitespace-nowrap">
                                      <span className="text-red-900/60">
                                        {formatDateTime(p.createdAt)}
                                      </span>
                                    </td>
                                    <td className="py-4 px-4 text-center uppercase text-[10px] tracking-widest text-red-700/60">
                                      {p.method}
                                    </td>
                                    <td className="py-4 px-4 text-right text-red-900/60">
                                      {p.fee > 0 ? (
                                        `₹${p.fee.toFixed(2)}`
                                      ) : (
                                        <span className="text-red-700/60 italic text-[11px]" title="Estimated based on method">
                                          ₹{getEstimatedFeeAndTax(p.amount, p.method).toFixed(2)} (Est.)
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-4 px-4 text-center font-medium text-[13px] text-red-700">
                                      ₹{p.amount.toLocaleString("en-IN")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </main>
        
        {/* Render OrderDetailModal if an order is selected */}
        {selectedOrder && (
          <OrderDetailModal
            order={selectedOrder}
            metaMap={metaMap}
            onClose={() => setSelectedOrder(null)}
          />
        )}
      </div>
    </div>
  );
}
