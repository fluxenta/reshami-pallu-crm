"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Sparkles, Plus, Trash2, ArrowUpRight, ArrowDownRight, Activity, Calendar, FileText, IndianRupee, Loader2 } from "lucide-react";

interface Transaction {
  id: string;
  type: "cost" | "expense" | "side_income";
  amount: number;
  date: string;
  notes: string;
  createdAt: string;
  isSystem?: boolean;
}

const emptyForm = {
  type: "expense" as "cost" | "expense" | "side_income",
  amount: "",
  date: new Date().toISOString().split("T")[0],
  notes: ""
};

export default function FinancialsDashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function loadTransactions() {
    try {
      const res = await fetch("/api/financials");
      if (res.ok) {
        const data = await res.json();
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      }
    } catch (err) {
      console.error("Failed to load transactions", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTransactions();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    
    setIsSaving(true);
    try {
      const res = await fetch("/api/financials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setForm({
          ...emptyForm,
          date: new Date().toISOString().split("T")[0]
        });
        alert("Transaction added successfully!");
      }
    } catch (err) {
      console.error("Failed to save transaction", err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    setActionLoading(id);
    try {
      const res = await fetch("/api/financials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id })
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error("Failed to delete transaction", err);
    } finally {
      setActionLoading(null);
    }
  }

  // P&L Calculations
  const totalCost = transactions
    .filter(t => t.type === "cost")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSideIncome = transactions
    .filter(t => t.type === "side_income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutflow = totalCost + totalExpense;
  const netProfitLoss = totalSideIncome - totalOutflow;

  const inputCls =
    "h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-sm outline-none transition focus:border-[#4A154B] focus:ring-2 focus:ring-[#4A154B]/10";

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Financial Ledger" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1100px] mx-auto w-full space-y-6 sm:space-y-8">
          
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/40 border border-[#4A154B]/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-[#4A154B] flex items-center gap-2">
                <Sparkles size={18} className="text-[#D4AF37]" />
                Proprietor Financial Dashboard
              </h3>
              <p className="text-xs text-[#1A1A1A]/60 mt-0.5">
                Manage saree sourcing costs, business operating expenses, and secondary income pipelines.
              </p>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Saree sourcing costs */}
            <div className="ui-card p-5 relative overflow-hidden bg-white/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                  <ArrowDownRight size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Sourcing Costs</span>
                  <h4 className="text-xl font-display font-bold text-[#4A154B] mt-0.5">
                    ₹{totalCost.toLocaleString("en-IN")}
                  </h4>
                </div>
              </div>
            </div>

            {/* Operating expenses */}
            <div className="ui-card p-5 relative overflow-hidden bg-white/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
                  <ArrowDownRight size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Expenses</span>
                  <h4 className="text-xl font-display font-bold text-[#4A154B] mt-0.5">
                    ₹{totalExpense.toLocaleString("en-IN")}
                  </h4>
                </div>
              </div>
            </div>

            {/* Side income */}
            <div className="ui-card p-5 relative overflow-hidden bg-white/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center text-green-600">
                  <ArrowUpRight size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Side Income</span>
                  <h4 className="text-xl font-display font-bold text-[#4A154B] mt-0.5">
                    ₹{totalSideIncome.toLocaleString("en-IN")}
                  </h4>
                </div>
              </div>
            </div>

            {/* Net P&L */}
            <div className={`ui-card p-5 relative overflow-hidden ${
              netProfitLoss >= 0 ? "bg-green-50/50 border-green-200" : "bg-red-50/50 border-red-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  netProfitLoss >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  <Activity size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Net Profit / Loss</span>
                  <h4 className={`text-xl font-display font-bold mt-0.5 ${
                    netProfitLoss >= 0 ? "text-green-700" : "text-red-700"
                  }`}>
                    ₹{netProfitLoss.toLocaleString("en-IN")}
                  </h4>
                </div>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left: Add New entry */}
            <div className="lg:col-span-4 space-y-6">
              <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#4A154B]/8 shadow-sm p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-[#4A154B]/8">
                  <Plus size={16} className="text-[#4A154B]" />
                  <span className="font-bold text-sm text-[#4A154B] uppercase tracking-wider">Add Transaction</span>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#4A154B]/70">Transaction Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm(f => ({ ...f, type: e.target.value as any }))}
                      className={inputCls}
                    >
                      <option value="expense">Operating Expense</option>
                      <option value="cost">Saree Sourcing Cost</option>
                      <option value="side_income">Secondary Side Income</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#4A154B]/70">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 5000"
                      value={form.amount}
                      onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                      className={inputCls}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#4A154B]/70">Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                      className={inputCls}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#4A154B]/70">Description / Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Courier charges, Banaras travel"
                      value={form.notes}
                      onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl uppercase tracking-wider text-xs font-semibold cursor-pointer border-none shadow-md"
                  >
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    {isSaving ? "Saving..." : "Add Entry"}
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Ledger lists */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-2xl border border-[#4A154B]/8 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-[#4A154B]/8">
                  <FileText size={16} className="text-[#4A154B]" />
                  <span className="font-bold text-sm text-[#4A154B] uppercase tracking-wider">
                    Recent Transactions
                  </span>
                  <span className="ml-auto text-xs text-[#1A1A1A]/45 font-medium">
                    {transactions.length} entries recorded
                  </span>
                </div>

                {isLoading ? (
                  <div className="p-10 text-center space-y-3">
                    <Loader2 className="animate-spin text-[#4A154B] mx-auto" size={24} />
                    <p className="text-xs text-[#1A1A1A]/55">Loading transaction history...</p>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="p-10 text-center">
                    <IndianRupee size={36} className="text-[#4A154B]/20 mx-auto mb-3" />
                    <p className="text-sm text-[#1A1A1A]/50">No transactions recorded yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#4A154B]/10 text-[10px] uppercase tracking-wider text-[#1A1A1A]/50 font-bold px-5 bg-[#FAF8F5]/50">
                          <th className="py-3 pl-5">Date</th>
                          <th className="py-3">Type</th>
                          <th className="py-3">Details / Notes</th>
                          <th className="py-3 text-right pr-5">Amount</th>
                          <th className="py-3 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#4A154B]/5 text-xs text-[#1A1A1A]/80">
                        {transactions.map((t) => {
                          const isDeleting = actionLoading === t.id;
                          return (
                            <tr key={t.id} className="hover:bg-[#4A154B]/3 transition-colors duration-200">
                              <td className="py-3.5 pl-5 font-medium whitespace-nowrap">
                                <span className="flex items-center gap-1.5">
                                  <Calendar size={12} className="text-[#1A1A1A]/40" />
                                  {new Date(t.date).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric"
                                  })}
                                </span>
                              </td>
                              <td className="py-3.5">
                                <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider ${
                                  t.type === "cost"
                                    ? "bg-orange-50 text-orange-700 border border-orange-100"
                                    : t.type === "expense"
                                    ? "bg-red-50 text-red-700 border border-red-100"
                                    : "bg-green-50 text-green-700 border border-green-100"
                                }`}>
                                  {t.type === "cost" ? "Cost" : t.type === "expense" ? "Expense" : "Income"}
                                </span>
                              </td>
                              <td className="py-3.5 max-w-[240px] truncate pr-4">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{t.notes || <span className="italic text-[#1A1A1A]/40">No description</span>}</span>
                                  {t.isSystem && (
                                    <span className="bg-blue-50 border border-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider scale-95 shrink-0">
                                      Shopify Sync
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className={`py-3.5 text-right font-semibold pr-5 text-sm ${
                                t.type === "side_income" ? "text-green-700" : "text-red-700"
                              }`}>
                                {t.type === "side_income" ? "+" : "-"} ₹{t.amount.toLocaleString("en-IN")}
                              </td>
                              <td className="py-3.5 text-center pr-5">
                                {!t.isSystem ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(t.id)}
                                    disabled={isDeleting}
                                    title="Delete transaction"
                                    className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center transition border-none bg-transparent cursor-pointer disabled:opacity-40"
                                  >
                                    {isDeleting ? (
                                      <Loader2 size={14} className="animate-spin text-red-400" />
                                    ) : (
                                      <Trash2 size={14} className="text-red-500 hover:text-red-700" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-blue-500 font-bold uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-200/50">Auto</span>
                                )}
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

          </div>

        </main>
      </div>
    </div>
  );
}
