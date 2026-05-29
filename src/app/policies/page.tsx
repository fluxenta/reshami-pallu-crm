"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Sparkles, Save, ShieldAlert, RefreshCw, BookOpen, AlertCircle } from "lucide-react";

type PolicyType = "refundPolicy" | "shippingPolicy" | "privacyPolicy" | "termsOfService";

const POLICY_LABELS: Record<PolicyType, string> = {
  refundPolicy: "Refund & Return Policy",
  shippingPolicy: "Shipping & Delivery Policy",
  privacyPolicy: "Privacy Policy",
  termsOfService: "Terms of Service",
};

const POLICY_HELPMESSAGES: Record<PolicyType, string> = {
  refundPolicy: "Define terms of cancellations, 3-day returns, replacements, and refund capture timelines.",
  shippingPolicy: "Define package processing timelines (e.g. 24-48 hours), delivery speeds, and tracking configurations.",
  privacyPolicy: "Detail the customer metadata collected (such as phone numbers, addresses) and integrations with Delhivery / Razorpay.",
  termsOfService: "Provide standard proprietorship compliance rules, payment agreement terms, and governing Bengaluru jurisdictions.",
};

export default function PoliciesAdminPage() {
  const [policies, setPolicies] = useState<Record<PolicyType, string>>({
    refundPolicy: "",
    shippingPolicy: "",
    privacyPolicy: "",
    termsOfService: "",
  });
  
  const [activeTab, setActiveTab] = useState<PolicyType>("refundPolicy");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadPolicies() {
    try {
      const res = await fetch("/api/policies");
      if (res.ok) {
        const data = await res.json();
        setPolicies({
          refundPolicy: data.refundPolicy || "",
          shippingPolicy: data.shippingPolicy || "",
          privacyPolicy: data.privacyPolicy || "",
          termsOfService: data.termsOfService || "",
        });
      }
    } catch (err) {
      console.error("Failed to load policies:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicies();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [activeTab]: policies[activeTab],
        }),
      });

      if (res.ok) {
        alert(`${POLICY_LABELS[activeTab]} updated in Shopify successfully! Shopify is your dynamic source of truth.`);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update policy");
      }
    } catch (err: any) {
      alert("Error saving policy: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Shopify Policy Manager" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1000px] mx-auto w-full space-y-6 sm:space-y-8">
          
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/40 border border-[#4A154B]/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-[#4A154B] flex items-center gap-2">
                <Sparkles size={18} className="text-[#D4AF37]" />
                Direct Shopify Policies Editor
              </h3>
              <p className="text-xs text-[#1A1A1A]/60 mt-0.5">
                Update store policies directly inside Shopify. Shopify is the dynamic source of truth.
              </p>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-orange-800 flex items-start gap-3">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-orange-600" />
            <div>
              <span className="font-bold block mb-0.5">Shopify Source of Truth Sync</span>
              <span>Changes made here are saved directly in your Shopify backend. The storefront website pulls these dynamically, so updates will show up live store-wide.</span>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-2">
              <RefreshCw className="animate-spin text-[#4A154B]" size={28} />
              <p className="text-sm text-[#1A1A1A]/60">Fetching active policies from Shopify...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              
              {/* Left Side: Tabs */}
              <div className="md:col-span-4 space-y-2">
                {(Object.keys(POLICY_LABELS) as PolicyType[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wider border-none transition cursor-pointer ${
                      activeTab === tab
                        ? "bg-[#4A154B] text-white shadow-md"
                        : "bg-white border border-[#4A154B]/5 text-[#1A1A1A]/70 hover:bg-[#4A154B]/5 hover:text-[#4A154B]"
                    }`}
                  >
                    {POLICY_LABELS[tab]}
                  </button>
                ))}
              </div>

              {/* Right Side: Editor form */}
              <div className="md:col-span-8">
                <form onSubmit={handleSave} className="ui-card p-6 space-y-6">
                  <div>
                    <h4 className="font-display font-bold text-[#4A154B] text-base">
                      {POLICY_LABELS[activeTab]}
                    </h4>
                    <p className="text-xs text-[#1A1A1A]/50 mt-1">
                      {POLICY_HELPMESSAGES[activeTab]} Supports raw Markdown and HTML.
                    </p>
                  </div>

                  <div>
                    <textarea
                      value={policies[activeTab]}
                      onChange={(e) => setPolicies(p => ({ ...p, [activeTab]: e.target.value }))}
                      rows={18}
                      className="w-full text-sm rounded-lg border border-[#4A154B]/10 p-4 bg-white/50 focus:bg-white focus:outline-none focus:border-[#4A154B] transition-colors leading-relaxed font-mono"
                      placeholder="Write policy content here..."
                      required
                    />
                  </div>

                  <div className="flex justify-end pt-2 border-t border-[#4A154B]/5">
                    <button
                      type="submit"
                      disabled={saving}
                      className="btn-primary flex items-center gap-2 py-3 px-6 shadow-lg rounded-xl uppercase tracking-wider text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Saving in Shopify...
                        </>
                      ) : (
                        <>
                          <Save size={14} />
                          Save Policy
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}

        </main>
      </div>
    </div>
  );
}
