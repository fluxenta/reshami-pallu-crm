"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import {
  Sparkles,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  XCircle,
  Ticket,
  Tag,
  Loader2,
} from "lucide-react";

interface Coupon {
  code: string;
  discountPercent: number;
  minPurchase: number;
  isActive: boolean;
  updatedAt: string;
}

const emptyForm = { code: "", discountPercent: 10, minPurchase: 0, isActive: true };

export default function DiscountsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadCoupons() {
    try {
      const res = await fetch("/api/coupon");
      if (res.ok) {
        const data = await res.json();
        setCoupons(Array.isArray(data.coupons) ? data.coupons : []);
      }
    } catch (err) {
      console.error("Failed to load coupons", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadCoupons(); }, []);

  function flash(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleAddCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          discountPercent: form.discountPercent,
          minPurchase: form.minPurchase,
          isActive: form.isActive,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCoupons(data.coupons || []);
        setForm(emptyForm);
        flash("success", `Coupon "${form.code.toUpperCase()}" saved successfully!`);
      } else {
        flash("error", data.error || "Failed to save coupon.");
      }
    } catch {
      flash("error", "A network error occurred.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(code: string) {
    setActionLoading(code + "_toggle");
    try {
      const res = await fetch("/api/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", code }),
      });
      const data = await res.json();
      if (res.ok) setCoupons(data.coupons || []);
    } catch {
      flash("error", "Failed to toggle coupon.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(code: string) {
    setActionLoading(code + "_delete");
    try {
      const res = await fetch("/api/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", code }),
      });
      const data = await res.json();
      if (res.ok) {
        setCoupons(data.coupons || []);
        flash("success", `Coupon "${code}" deleted.`);
      }
    } catch {
      flash("error", "Failed to delete coupon.");
    } finally {
      setActionLoading(null);
    }
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-sm outline-none transition focus:border-[#4A154B] focus:ring-2 focus:ring-[#4A154B]/10";

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Discount Coupons" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[900px] mx-auto w-full space-y-6">

          {/* Header Banner */}
          <div className="flex items-center gap-3 bg-white/40 border border-[#4A154B]/10 rounded-2xl p-4 sm:p-5 backdrop-blur-md">
            <div className="flex items-center justify-center bg-[#4A154B]/8 rounded-xl p-2.5">
              <Sparkles size={20} className="text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-[#4A154B]">
                Multi-Coupon Discount Manager
              </h3>
              <p className="text-xs text-[#1A1A1A]/55 mt-0.5">
                Create, activate, and delete promotional codes applied store-wide in real-time.
              </p>
            </div>
          </div>

          {/* Toast */}
          {message && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
              message.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}>
              {message.type === "success"
                ? <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-green-600" />
                : <XCircle size={18} className="shrink-0 mt-0.5 text-red-500" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Add New Coupon Form */}
          <form onSubmit={handleAddCoupon} className="bg-white rounded-2xl border border-[#4A154B]/8 shadow-sm p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-[#4A154B]/8">
              <Plus size={16} className="text-[#4A154B]" />
              <span className="font-bold text-sm text-[#4A154B] uppercase tracking-wider">Add New Coupon</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#4A154B]/70">Promo Code</label>
                <input
                  className={inputCls}
                  placeholder="e.g. SUMMER20"
                  value={form.code}
                  onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#4A154B]/70">Discount %</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  className={inputCls}
                  value={form.discountPercent}
                  onChange={(e) => setForm(f => ({ ...f, discountPercent: Math.max(1, Number(e.target.value)) }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#4A154B]/70">Min Purchase (₹)</label>
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  placeholder="0 = no minimum"
                  value={form.minPurchase}
                  onChange={(e) => setForm(f => ({ ...f, minPurchase: Math.max(0, Number(e.target.value)) }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isActive}
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  className={`relative h-6 w-11 rounded-full transition border-none cursor-pointer ${
                    form.isActive ? "bg-[#4A154B]" : "bg-black/15"
                  }`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition pointer-events-none ${
                    form.isActive ? "left-[22px]" : "left-0.5"
                  }`} />
                </button>
                <span className="text-sm text-[#1A1A1A]/70">
                  {form.isActive ? "Active on storefront" : "Inactive (disabled)"}
                </span>
              </label>

              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider font-semibold border-none shadow-md cursor-pointer disabled:opacity-60"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {isSaving ? "Saving..." : "Add Coupon"}
              </button>
            </div>
          </form>

          {/* Coupons List */}
          <div className="bg-white rounded-2xl border border-[#4A154B]/8 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#4A154B]/8">
              <Tag size={16} className="text-[#4A154B]" />
              <span className="font-bold text-sm text-[#4A154B] uppercase tracking-wider">
                All Coupons
              </span>
              <span className="ml-auto text-xs text-[#1A1A1A]/45 font-medium">
                {coupons.length} coupon{coupons.length !== 1 ? "s" : ""}
              </span>
            </div>

            {isLoading ? (
              <div className="p-10 text-center space-y-3 animate-pulse">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 bg-[#4A154B]/5 rounded-xl mx-4" />
                ))}
              </div>
            ) : coupons.length === 0 ? (
              <div className="p-10 text-center">
                <Ticket size={36} className="text-[#4A154B]/20 mx-auto mb-3" />
                <p className="text-sm text-[#1A1A1A]/50">No coupons yet. Add one above!</p>
              </div>
            ) : (
              <div className="divide-y divide-[#4A154B]/5">
                {coupons.map((coupon) => {
                  const isToggling = actionLoading === coupon.code + "_toggle";
                  const isDeleting = actionLoading === coupon.code + "_delete";
                  return (
                    <div key={coupon.code} className="flex items-center gap-4 px-5 py-4">
                      {/* Status dot */}
                      <div className={`w-2 h-2 rounded-full shrink-0 ${coupon.isActive ? "bg-green-500" : "bg-[#1A1A1A]/20"}`} />

                      {/* Code + details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-[#4A154B] text-sm bg-[#4A154B]/6 px-2.5 py-0.5 rounded-lg">
                            {coupon.code}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            coupon.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-[#1A1A1A]/8 text-[#1A1A1A]/50"
                          }`}>
                            {coupon.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-xs text-[#1A1A1A]/50 mt-1">
                          <span className="font-medium text-[#1A1A1A]/70">{coupon.discountPercent}% off</span>
                          {coupon.minPurchase > 0
                            ? ` · Min. purchase ₹${coupon.minPurchase.toLocaleString("en-IN")}`
                            : " · No minimum purchase"}
                        </p>
                      </div>

                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggle(coupon.code)}
                        disabled={isToggling || isDeleting}
                        title={coupon.isActive ? "Disable coupon" : "Enable coupon"}
                        className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-[#4A154B]/6 transition cursor-pointer border-none bg-transparent disabled:opacity-40"
                      >
                        {isToggling
                          ? <Loader2 size={18} className="animate-spin text-[#4A154B]/50" />
                          : coupon.isActive
                          ? <ToggleRight size={22} className="text-[#4A154B]" />
                          : <ToggleLeft size={22} className="text-[#1A1A1A]/35" />
                        }
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDelete(coupon.code)}
                        disabled={isToggling || isDeleting}
                        title="Delete coupon"
                        className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-red-50 transition cursor-pointer border-none bg-transparent disabled:opacity-40"
                      >
                        {isDeleting
                          ? <Loader2 size={16} className="animate-spin text-rose-400" />
                          : <Trash2 size={16} className="text-rose-500" />
                        }
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
