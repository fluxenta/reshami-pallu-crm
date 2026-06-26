"use client";

import { useEffect, useState, Fragment } from "react";
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
  ChevronUp,
  Users,
  Percent,
  TrendingUp,
  Coins
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
  cogs?: number;
  profit?: number;
  marginPercent?: number;
  hasCostDetails?: boolean;
  settlementId?: string | null;
  settledAt?: string | null;
}

interface Settlement {
  id: string;
  amount: number;
  fees: number;
  tax: number;
  status: string;
  utr: string;
  createdAt: string;
  transactions?: any[];
}

interface RazorpayCustomer {
  name: string;
  email: string;
  contact: string;
  totalSpent: number;
  ordersCount: number;
  lastOrderDate: string;
  source?: string;
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

function formatContactWithoutCountryCode(contact: string): string {
  if (!contact || contact === "N/A") return contact;
  const cleaned = contact.replace(/\D/g, "");
  if (cleaned.length > 10) {
    return cleaned.slice(-10);
  }
  return contact;
}



interface BankingBalance {
  accountNumber: string;
  accountType: string;
  bankName: string;
  bankCode: string;
  currency: string;
  amount: number;
  availableAmount: number;
  refreshedAt: string | null;
}

export default function RazorpayFinancialsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [razorpayCustomers, setRazorpayCustomers] = useState<RazorpayCustomer[]>([]);
  const [balances, setBalances] = useState<BankingBalance[]>([]);
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
  const [activeTab, setActiveTab] = useState<"collections" | "settlements" | "customers" | "margins">("collections");
  const [expandedSettlementId, setExpandedSettlementId] = useState<string | null>(null);

  async function loadRazorpayData() {
    try {
      const res = await fetch("/api/financials/razorpay");
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
        setSettlements(data.settlements || []);
        setRazorpayCustomers(data.customers || []);
        setBalances(data.balances || []);
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
  
  // Dynamic aggregations
  const computedTotalFees = capturedOrRefundedPayments.reduce((acc, p) => {
    return acc + p.fee;
  }, 0);

  const totalSettledReal = settlements
    .filter(s => s.status === "processed")
    .reduce((acc, s) => acc + s.amount, 0);

  // Aggregated Customer LTV Profiles
  const customerLTVList = razorpayCustomers;

  // Margin Summaries
  const marginMetrics = (() => {
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalFees = 0;
    let orderCountWithCost = 0;
    let mappedOrdersCount = 0;

    payments.forEach(p => {
      if (p.status !== "captured") return;
      totalRevenue += p.amount;
      totalFees += p.fee;
      if (p.shopifyOrderName) {
        mappedOrdersCount++;
        if (p.cogs && p.cogs > 0) {
          totalCogs += p.cogs;
          orderCountWithCost++;
        }
      }
    });

    const netRevenue = totalRevenue - totalFees;
    const grossProfit = netRevenue - totalCogs;
    const grossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCogs,
      totalFees,
      netRevenue,
      grossProfit,
      grossMarginPercent,
      orderCountWithCost,
      mappedOrdersCount,
    };
  })();

  // Search filtering
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

  const filteredSettlements = settlements.filter(s => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      s.id.toLowerCase().includes(query) ||
      (s.utr && s.utr.toLowerCase().includes(query)) ||
      s.status.toLowerCase().includes(query)
    );
  });

  const filteredCustomers = customerLTVList.filter(c => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      c.name.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query) ||
      c.contact.toLowerCase().includes(query)
    );
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingSettlements = payments
    .filter(p => p.status === "captured")
    .reduce((acc, p) => {
      const settleStr = getEstimatedSettlementDate(p.createdAt);
      const settleDate = new Date(settleStr);
      if (settleDate >= today) {
        if (!acc[settleStr]) acc[settleStr] = 0;
        const fee = p.fee;
        acc[settleStr] += (p.amount - fee);
      }
      return acc;
    }, {} as Record<string, number>);

  const sortedSettlementDates = Object.keys(upcomingSettlements).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const nextSettlementDateStr = sortedSettlementDates[0];
  const nextSettlementAmount = nextSettlementDateStr ? upcomingSettlements[nextSettlementDateStr] : 0;

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Razorpay Financials" />

        <main className="flex-1 overflow-y-auto p-6 sm:p-10 max-w-[1500px] mx-auto w-full space-y-8 sm:space-y-10">
          
          {/* Banking Balances Banner */}
          {balances.length > 0 && (
            <div className="bg-[#4A154B]/5 border border-[#4A154B]/10 rounded-2xl p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 shadow-md">
              <div className="space-y-1">
                <span className="text-xs uppercase font-bold text-[#4A154B] tracking-wider flex items-center gap-2">
                  <CreditCard size={14} />
                  Connected Banking Accounts
                </span>
                <p className="text-xs text-[#1A1A1A]/60">Real-time banking balances fetched from your linked Razorpay/RazorpayX accounts</p>
              </div>
              <div className="flex flex-wrap gap-4 w-full lg:w-auto">
                {balances.map((b, idx) => (
                  <div key={idx} className="bg-white border border-[#4A154B]/8 rounded-xl px-5 py-3 flex items-center gap-4 min-w-[280px] shadow-sm flex-1 sm:flex-initial">
                    <div className="w-10 h-10 rounded-lg bg-purple-50 text-[#4A154B] flex items-center justify-center font-bold text-xs uppercase">
                      {b.bankCode ? b.bankCode.slice(0, 4) : "BANK"}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="font-bold text-sm text-[#4A154B]">{b.bankName}</span>
                        {b.accountNumber && (
                          <span className="text-[10px] text-[#1A1A1A]/40 font-mono font-medium">*{b.accountNumber.slice(-4)}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-baseline mt-1 gap-2">
                        <span className="text-[11px] text-[#1A1A1A]/50 capitalize">{b.accountType.replace("_", " ")}</span>
                        <span className="font-extrabold text-base text-[#4A154B]">
                          ₹{b.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Total collections */}
            <div className="ui-card p-6 relative overflow-hidden bg-white/85 shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center text-green-600">
                  <ArrowUpRight size={22} />
                </div>
                <div>
                  <span className="text-xs uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Gross Collected</span>
                  <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-1">
                    ₹{summary.totalCaptured.toLocaleString("en-IN")}
                  </h4>
                </div>
              </div>
            </div>

            {/* Gateway Fees */}
            <div className="ui-card p-6 relative overflow-hidden bg-white/85 shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
                  <ArrowDownRight size={22} />
                </div>
                <div>
                  <span className="text-xs uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Fees & Tax</span>
                  <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-1 flex items-end gap-1.5">
                    ₹{computedTotalFees.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                  </h4>
                </div>
              </div>
            </div>

            {/* Real Settled Amount */}
            <div className="ui-card p-6 relative overflow-hidden bg-white/85 shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Coins size={22} />
                </div>
                <div>
                  <span className="text-xs uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Total Settled</span>
                  <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-1">
                    ₹{totalSettledReal.toLocaleString("en-IN")}
                  </h4>
                </div>
              </div>
            </div>

            {/* Gross Profit Margin */}
            <div className="ui-card p-6 relative overflow-hidden bg-purple-50/50 border-purple-200 shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <TrendingUp size={22} />
                </div>
                <div>
                  <span className="text-xs uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Gross Margin</span>
                  <h4 className="text-2xl font-display font-bold text-[#4A154B] mt-1 flex items-end gap-2">
                    {marginMetrics.grossMarginPercent.toFixed(1)}%
                    <span className="text-xs font-normal text-[#1A1A1A]/40 mb-1">
                      (₹{marginMetrics.grossProfit.toLocaleString("en-IN", { maximumFractionDigits: 0 })})
                    </span>
                  </h4>
                </div>
              </div>
            </div>

          </div>

          {/* Tab Navigation Menu */}
          <div className="flex border-b border-[#4A154B]/10 gap-8 text-base">
            <button
              onClick={() => setActiveTab("collections")}
              className={`pb-4 font-bold uppercase tracking-wider text-sm border-b-2 cursor-pointer transition-colors ${
                activeTab === "collections"
                  ? "border-[#4A154B] text-[#4A154B]"
                  : "border-transparent text-[#1A1A1A]/40 hover:text-[#1A1A1A]/80"
              }`}
            >
              Collections
            </button>
            <button
              onClick={() => setActiveTab("settlements")}
              className={`pb-4 font-bold uppercase tracking-wider text-sm border-b-2 cursor-pointer transition-colors ${
                activeTab === "settlements"
                  ? "border-[#4A154B] text-[#4A154B]"
                  : "border-transparent text-[#1A1A1A]/40 hover:text-[#1A1A1A]/80"
              }`}
            >
              Settlements
            </button>
            <button
              onClick={() => setActiveTab("customers")}
              className={`pb-4 font-bold uppercase tracking-wider text-sm border-b-2 cursor-pointer transition-colors ${
                activeTab === "customers"
                  ? "border-[#4A154B] text-[#4A154B]"
                  : "border-transparent text-[#1A1A1A]/40 hover:text-[#1A1A1A]/80"
              }`}
            >
              Customers & LTV
            </button>
            <button
              onClick={() => setActiveTab("margins")}
              className={`pb-4 font-bold uppercase tracking-wider text-sm border-b-2 cursor-pointer transition-colors ${
                activeTab === "margins"
                  ? "border-[#4A154B] text-[#4A154B]"
                  : "border-transparent text-[#1A1A1A]/40 hover:text-[#1A1A1A]/80"
              }`}
            >
              Margin Analysis
            </button>
          </div>

          {/* Main Content Box */}
          <div className="bg-white rounded-2xl border border-[#4A154B]/8 shadow-md overflow-hidden space-y-6 p-6 sm:p-8">
            
            {/* Search and Table header */}
            {activeTab !== "margins" && (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-[#1A1A1A]/80 uppercase tracking-widest">
                    {activeTab === "collections" && "Payment Feed"}
                    {activeTab === "settlements" && "Settlement History"}
                    {activeTab === "customers" && "Customer Profiles"}
                  </span>
                </div>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="relative w-full sm:w-80">
                    <input
                      type="text"
                      placeholder={`Search ${activeTab}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-11 pl-11 pr-5 rounded-full border border-[#1A1A1A]/10 bg-[#FAF8F5]/50 text-sm outline-none focus:border-[#4A154B]/30 focus:ring-1 focus:ring-[#4A154B]/10 transition-all text-[#1A1A1A]/80"
                    />
                    <Search size={18} className="absolute left-4 top-3 text-[#1A1A1A]/40" />
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing || isLoading}
                    className="p-2.5 rounded-full text-[#1A1A1A]/40 hover:bg-[#1A1A1A]/5 hover:text-[#1A1A1A]/80 transition-colors cursor-pointer disabled:opacity-50"
                    title="Refresh Data"
                  >
                    <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>
            )}

            {/* Conditional Tabs Content */}
            {isLoading ? (
              <div className="p-20 text-center space-y-4">
                <Loader2 className="animate-spin text-[#4A154B] mx-auto" size={32} />
                <p className="text-sm text-[#1A1A1A]/55">Fetching feed from Razorpay API...</p>
              </div>
            ) : (() => {
              if (activeTab === "collections") {
                const capturedPayments = filteredPayments.filter(p => p.status === "captured" || p.status === "refunded");
                const failedPayments = filteredPayments.filter(p => p.status === "failed");

                return (
                  <div className="space-y-8">
                    {/* Main Captured Payments Table */}
                    <div className="space-y-3">
                      <span className="text-xs uppercase font-bold text-green-700 tracking-wider block px-1">
                        Successful Collections ({capturedPayments.length})
                      </span>
                      {capturedPayments.length === 0 ? (
                        <div className="p-12 text-center text-sm text-[#1A1A1A]/50 bg-[#FAF8F5] rounded-xl border border-dashed border-[#1A1A1A]/10">
                          No captured transactions found matching search.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-[#4A154B]/8">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-[#1A1A1A]/5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 font-semibold bg-[#FAF8F5]/50">
                                <th className="py-5 px-5 font-semibold text-left">Order</th>
                                <th className="py-5 px-5 font-semibold text-left">Time</th>
                                <th className="py-5 px-5 font-semibold text-center">Method</th>
                                <th className="py-5 px-5 font-semibold text-left">Settlement Date</th>
                                <th className="py-5 px-5 font-semibold text-right">Fee</th>
                                <th className="py-5 px-5 font-semibold text-center">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="text-[#1A1A1A]/80">
                              {capturedPayments.map((p) => (
                                <tr key={p.id} className="hover:bg-[#1A1A1A]/[0.02] transition-colors border-b border-[#1A1A1A]/[0.02] last:border-none group">
                                  <td className="py-5 px-5">
                                    {p.shopifyOrderName ? (
                                      <button 
                                        onClick={() => {
                                          if (p.shopifyOrder) {
                                            setSelectedOrder(p.shopifyOrder);
                                          } else {
                                            alert("Order details not loaded yet.");
                                          }
                                        }}
                                        className="inline-block text-[#4A154B] font-bold text-xs uppercase underline underline-offset-4 decoration-[#4A154B]/30 hover:decoration-[#4A154B] hover:text-[#D4AF37] transition-all cursor-pointer"
                                      >
                                        {p.shopifyOrderName}
                                      </button>
                                    ) : (
                                      <span className="text-[#1A1A1A]/30 italic font-normal">Unmapped</span>
                                    )}
                                  </td>
                                  <td className="py-5 px-5 whitespace-nowrap">
                                    <span className="text-[#1A1A1A]/60">
                                      {formatDateTime(p.createdAt)}
                                    </span>
                                  </td>
                                  <td className="py-5 px-5 text-center uppercase text-xs tracking-widest text-[#1A1A1A]/55">
                                    {p.method}
                                  </td>
                                  <td className="py-5 px-5 font-medium text-[#1A1A1A]/60 whitespace-nowrap">
                                    <div className="flex flex-col gap-1.5">
                                      <span>
                                        {p.settledAt ? (
                                          new Date(p.settledAt).toLocaleDateString("en-IN", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric"
                                          })
                                        ) : (
                                          <span className="text-amber-600 font-medium italic">Pending</span>
                                        )}
                                      </span>
                                      {p.settlementId && (
                                        <span 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveTab("settlements");
                                            setExpandedSettlementId(p.settlementId || null);
                                          }}
                                          className="inline-block self-start px-2 py-0.5 text-[9px] font-bold font-mono bg-purple-50 text-[#4A154B] rounded border border-purple-150 cursor-pointer hover:bg-purple-100 transition-colors"
                                          title="Click to view settlement details"
                                        >
                                          {p.settlementId}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-5 px-5 text-right text-[#1A1A1A]/50 font-medium">
                                    ₹{p.fee.toFixed(2)}
                                  </td>
                                  <td className="py-5 px-5 text-center font-medium text-sm text-[#1A1A1A]/90">
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
                    <div className="border-t border-[#4A154B]/10 pt-6 space-y-3">
                      <button
                        onClick={() => setIsFailedCollapsed(!isFailedCollapsed)}
                        className="flex items-center justify-between w-full p-4 bg-red-50/40 border border-red-150/40 rounded-xl text-left hover:bg-red-50/70 transition-colors cursor-pointer"
                      >
                        <span className="text-xs uppercase font-bold text-red-700 tracking-wider flex items-center gap-2">
                          <AlertCircle size={14} />
                          Failed Transactions ({failedPayments.length})
                        </span>
                        {isFailedCollapsed ? (
                          <ChevronDown size={18} className="text-red-700" />
                        ) : (
                          <ChevronUp size={18} className="text-red-700" />
                        )}
                      </button>

                      {!isFailedCollapsed && (
                        <div className="mt-3">
                          {failedPayments.length === 0 ? (
                            <div className="p-12 text-center text-sm text-[#1A1A1A]/50 bg-[#FAF8F5] rounded-xl border border-dashed border-[#1A1A1A]/10">
                              No failed transactions found matching search.
                            </div>
                          ) : (
                            <div className="overflow-x-auto border border-red-150/20 rounded-xl">
                              <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                  <tr className="border-b border-[#1A1A1A]/5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 font-semibold bg-[#FAF8F5]/30">
                                    <th className="py-5 px-5 font-semibold text-left">Order</th>
                                    <th className="py-5 px-5 font-semibold text-left">Time</th>
                                    <th className="py-5 px-5 font-semibold text-center">Method</th>
                                    <th className="py-5 px-5 font-semibold text-right">Fee</th>
                                    <th className="py-5 px-5 font-semibold text-center">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="text-red-900/90">
                                  {failedPayments.map((p) => (
                                    <tr key={p.id} className="hover:bg-red-50/20 transition-colors border-b border-[#1A1A1A]/[0.02] last:border-none group">
                                      <td className="py-5 px-5">
                                        {p.shopifyOrderName ? (
                                          <button 
                                            onClick={() => {
                                              if (p.shopifyOrder) {
                                                setSelectedOrder(p.shopifyOrder);
                                              } else {
                                                alert("Order details not loaded yet.");
                                              }
                                            }}
                                            className="inline-block text-red-700 font-bold text-xs uppercase underline underline-offset-4 decoration-red-700/30 hover:decoration-red-700 hover:text-red-900 transition-all cursor-pointer"
                                          >
                                            {p.shopifyOrderName}
                                          </button>
                                        ) : (
                                          <span className="text-red-700/40 italic font-normal">Unmapped</span>
                                        )}
                                      </td>
                                      <td className="py-5 px-5 whitespace-nowrap">
                                        <span className="text-red-900/60">
                                          {formatDateTime(p.createdAt)}
                                        </span>
                                      </td>
                                      <td className="py-5 px-5 text-center uppercase text-xs tracking-widest text-red-700/60">
                                        {p.method}
                                      </td>
                                      <td className="py-5 px-5 text-right text-red-900/60 font-medium">
                                        ₹{p.fee.toFixed(2)}
                                      </td>
                                      <td className="py-5 px-5 text-center font-semibold text-sm text-red-700">
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
              }

              if (activeTab === "settlements") {
                return (
                  <div className="overflow-x-auto rounded-xl border border-[#4A154B]/8">
                    {filteredSettlements.length === 0 ? (
                      <div className="p-20 text-center text-sm text-[#1A1A1A]/50 bg-[#FAF8F5] rounded-xl border border-dashed border-[#1A1A1A]/10">
                        No settlements found. Ensure you are syncing or check your keys.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-[#1A1A1A]/5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 font-semibold bg-[#FAF8F5]/50">
                            <th className="py-5 px-5 font-semibold text-left">Settlement ID</th>
                            <th className="py-5 px-5 font-semibold text-left">UTR Reference</th>
                            <th className="py-5 px-5 font-semibold text-left">Processed Date</th>
                            <th className="py-5 px-5 font-semibold text-right">Fees & Tax Deducted</th>
                            <th className="py-5 px-5 font-semibold text-center">Status</th>
                            <th className="py-5 px-5 font-semibold text-right">Net Amount Settled</th>
                          </tr>
                        </thead>
                        <tbody className="text-[#1A1A1A]/80">
                          {filteredSettlements.map((s) => (
                            <Fragment key={s.id}>
                              <tr 
                                onClick={() => setExpandedSettlementId(expandedSettlementId === s.id ? null : s.id)}
                                className="hover:bg-[#1A1A1A]/[0.02] cursor-pointer transition-colors border-b border-[#1A1A1A]/[0.02] last:border-none"
                              >
                                <td className="py-5 px-5 font-mono font-semibold text-[#4A154B]">{s.id}</td>
                                <td className="py-5 px-5 font-mono select-all text-[#1A1A1A]/60">{s.utr || "Pending UTR"}</td>
                                <td className="py-5 px-5 text-[#1A1A1A]/60">{formatDateTime(s.createdAt)}</td>
                                <td className="py-5 px-5 text-right text-red-600/80 font-medium">₹{(s.fees + s.tax).toFixed(2)}</td>
                                <td className="py-5 px-5 text-center">
                                  <span className={`px-2.5 py-1 text-xs uppercase font-bold tracking-wider rounded border ${
                                    s.status === "processed" 
                                      ? "bg-green-50 text-green-700 border-green-200" 
                                      : "bg-amber-50 text-amber-700 border-amber-200"
                                  }`}>
                                    {s.status}
                                  </span>
                                </td>
                                <td className="py-5 px-5 text-right font-bold text-sm text-green-700">
                                  ₹{s.amount.toLocaleString("en-IN")}
                                </td>
                              </tr>
                              {expandedSettlementId === s.id && (
                                <tr>
                                  <td colSpan={6} className="bg-[#FAF8F5]/80 p-6 border-b border-[#4A154B]/10">
                                    <div className="space-y-5">
                                      {/* Destination account details card */}
                                      <div className="bg-white border border-[#4A154B]/8 rounded-xl p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shadow-sm">
                                        <div className="space-y-1.5">
                                          <span className="text-xs uppercase font-bold text-[#1A1A1A]/40 tracking-wider">Destination Account</span>
                                          <div className="font-bold text-sm text-[#4A154B] flex items-center gap-2">
                                            <span>Primary Settled Bank Account</span>
                                            <span className="px-2 py-0.5 text-[9px] bg-green-50 text-green-700 font-bold border border-green-200 rounded uppercase">Verified</span>
                                          </div>
                                          <p className="text-xs text-[#1A1A1A]/55">Settled via Razorpay automated payouts (Standard T+2 cycle)</p>
                                        </div>
                                        <div className="text-right space-y-1.5">
                                          <span className="text-xs uppercase font-bold text-[#1A1A1A]/40 tracking-wider">Bank Reference UTR</span>
                                          <div className="font-mono text-sm font-bold select-all text-[#1A1A1A]/80">{s.utr || "Pending Payout"}</div>
                                        </div>
                                      </div>

                                      <h5 className="font-bold text-xs text-[#4A154B] uppercase tracking-wider">
                                        Settled Transactions Breakdown ({s.transactions?.length || 0})
                                      </h5>
                                      {(!s.transactions || s.transactions.length === 0) ? (
                                        <p className="text-xs text-[#1A1A1A]/55 italic">
                                          No transaction reconciliation records mapped within the active sync window.
                                        </p>
                                      ) : (
                                        <div className="overflow-x-auto rounded-lg border border-[#1A1A1A]/5 bg-white shadow-sm">
                                          <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                              <tr className="border-b border-[#1A1A1A]/5 text-[10px] uppercase tracking-widest text-[#1A1A1A]/40 font-semibold bg-[#FAF8F5] py-3">
                                                <th className="py-3 px-4 font-semibold">Transaction ID</th>
                                                <th className="py-3 px-4 font-semibold">Type</th>
                                                <th className="py-3 px-4 font-semibold text-right">Fee & Tax</th>
                                                <th className="py-3 px-4 font-semibold text-right">Net Amount</th>
                                              </tr>
                                            </thead>
                                            <tbody className="text-[#1A1A1A]/70">
                                              {s.transactions.map((t: any) => (
                                                <tr key={t.id} className="border-b border-[#1A1A1A]/[0.02] last:border-none hover:bg-gray-55/55">
                                                  <td className="py-3 px-4 font-mono text-[#4A154B]">{t.id}</td>
                                                  <td className="py-3 px-4 uppercase text-[10px] tracking-wider font-semibold">{t.type}</td>
                                                  <td className="py-3 px-4 text-right text-red-600">₹{(t.fee + t.tax).toFixed(2)}</td>
                                                  <td className="py-3 px-4 text-right font-semibold text-green-700">₹{t.amount.toLocaleString("en-IN")}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              }

              if (activeTab === "customers") {
                return (
                  <div className="overflow-x-auto rounded-xl border border-[#4A154B]/8">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-20 text-center text-sm text-[#1A1A1A]/50 bg-[#FAF8F5] rounded-xl border border-dashed border-[#1A1A1A]/10">
                        No customers found matching search.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-[#1A1A1A]/5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 font-semibold bg-[#FAF8F5]/50">
                            <th className="py-5 px-5 font-semibold text-left">Customer Name</th>
                            <th className="py-5 px-5 font-semibold text-left">Email Address</th>
                            <th className="py-5 px-5 font-semibold text-left">Contact Number</th>
                            <th className="py-5 px-5 font-semibold text-center">Orders Count</th>
                            <th className="py-5 px-5 font-semibold text-left">Last Order Date</th>
                            <th className="py-5 px-5 font-semibold text-right">LTV (Total Spent)</th>
                          </tr>
                        </thead>
                        <tbody className="text-[#1A1A1A]/80">
                          {filteredCustomers.map((c, i) => (
                            <tr key={i} className="hover:bg-[#1A1A1A]/[0.02] transition-colors border-b border-[#1A1A1A]/[0.02] last:border-none">
                              <td className="py-5 px-5 font-bold text-[#4A154B]">{c.name}</td>
                              <td className="py-5 px-5 text-[#1A1A1A]/60">{(!c.email || c.email === "N/A" || c.email.toLowerCase().endsWith("@reshmipallu.com")) ? "N/A" : c.email}</td>
                              <td className="py-5 px-5 text-[#1A1A1A]/60 font-mono">{formatContactWithoutCountryCode(c.contact)}</td>
                              <td className="py-5 px-5 text-center font-medium">{c.ordersCount}</td>
                              <td className="py-5 px-5 text-[#1A1A1A]/50">{formatDateTime(c.lastOrderDate)}</td>
                              <td className="py-5 px-5 text-right font-bold text-sm text-green-700">
                                ₹{c.totalSpent.toLocaleString("en-IN")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              }

              if (activeTab === "margins") {
                return (
                  <div className="space-y-8 pt-2">
                    
                    {/* Visual Financial Summary Panels */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      
                      <div className="bg-[#FAF8F5] border border-[#4A154B]/8 rounded-xl p-5 space-y-2 shadow-sm">
                        <span className="text-xs uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Gross Collections</span>
                        <div className="text-2xl font-bold text-[#4A154B]">₹{marginMetrics.totalRevenue.toLocaleString("en-IN")}</div>
                        <div className="text-xs text-[#1A1A1A]/40">Aggregate captured order total revenue</div>
                      </div>

                      <div className="bg-[#FAF8F5] border border-[#4A154B]/8 rounded-xl p-5 space-y-2 shadow-sm">
                        <span className="text-xs uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Cost of Goods Sold (COGS)</span>
                        <div className="text-2xl font-bold text-red-700">₹{marginMetrics.totalCogs.toLocaleString("en-IN")}</div>
                        <div className="text-xs text-amber-600 font-semibold">
                          Calculated for {marginMetrics.orderCountWithCost} / {marginMetrics.mappedOrdersCount} mapped Shopify orders
                        </div>
                      </div>

                      <div className="bg-green-50/40 border border-green-200/50 rounded-xl p-5 space-y-2 shadow-sm">
                        <span className="text-xs uppercase font-bold text-green-700 tracking-wider">Gross Margin Profit</span>
                        <div className="text-2xl font-bold text-green-700">₹{marginMetrics.grossProfit.toLocaleString("en-IN")}</div>
                        <div className="text-xs text-green-600 font-bold">{marginMetrics.grossMarginPercent.toFixed(1)}% Gross Margin rate</div>
                      </div>

                    </div>

                    {/* Order-level breakdown */}
                    <div className="space-y-4">
                      <span className="text-xs uppercase font-bold text-[#1A1A1A]/50 tracking-wider block px-1">
                        Order COGS & Margin Breakdown
                      </span>
                      <div className="overflow-x-auto rounded-xl border border-[#4A154B]/8">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-[#1A1A1A]/5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 font-semibold bg-[#FAF8F5]/80">
                              <th className="py-5 px-5 font-semibold text-left">Order Name</th>
                              <th className="py-5 px-5 font-semibold text-left">Customer</th>
                              <th className="py-5 px-5 font-semibold text-right">Revenue (Net)</th>
                              <th className="py-5 px-5 font-semibold text-right">Est. COGS</th>
                              <th className="py-5 px-5 font-semibold text-right">Net Profit</th>
                              <th className="py-5 px-5 font-semibold text-center">Gross Margin %</th>
                            </tr>
                          </thead>
                          <tbody className="text-[#1A1A1A]/80">
                            {payments
                              .filter(p => p.status === "captured" && p.shopifyOrderName)
                              .map((p, idx) => {
                                const netVal = p.amount - p.fee - p.tax;
                                const isCalculated = p.cogs && p.cogs > 0;
                                return (
                                  <tr key={idx} className="hover:bg-[#1A1A1A]/[0.02] transition-colors border-b border-[#1A1A1A]/[0.02] last:border-none">
                                    <td className="py-5 px-5 font-bold text-[#4A154B]">{p.shopifyOrderName}</td>
                                    <td className="py-5 px-5 text-[#1A1A1A]/60">
                                       {p.shopifyOrder?.customer 
                                         ? `${p.shopifyOrder.customer.firstName || ""} ${p.shopifyOrder.customer.lastName || ""}`.trim() 
                                         : (p.email !== "N/A" ? p.email : p.contact)}
                                     </td>
                                    <td className="py-5 px-5 text-right">₹{p.amount.toFixed(2)}</td>
                                    <td className="py-5 px-5 text-right">
                                      {isCalculated ? (
                                        `₹${p.cogs!.toFixed(2)}`
                                      ) : (
                                        <span className="text-amber-600/70 italic text-xs">Unset (SKU Costs missing)</span>
                                      )}
                                    </td>
                                    <td className={`py-5 px-5 text-right font-medium ${isCalculated ? "text-green-700 font-semibold" : "text-[#1A1A1A]/50"}`}>
                                      {isCalculated ? `₹${p.profit!.toFixed(2)}` : "-"}
                                    </td>
                                    <td className="py-5 px-5 text-center">
                                      {isCalculated ? (
                                        <span className={`px-3 py-1 text-xs uppercase font-bold tracking-wider rounded ${
                                          p.marginPercent! > 30 
                                            ? "bg-green-50 text-green-700" 
                                            : "bg-amber-50 text-amber-700"
                                        }`}>
                                          {p.marginPercent!.toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-amber-600/40">-</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                );
              }
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
