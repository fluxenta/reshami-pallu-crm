"use client";

import { useEffect, useState } from "react";
import { 
  X, 
  Package, 
  MapPin, 
  CreditCard, 
  TrendingUp, 
  DollarSign, 
  Truck, 
  Calendar,
  Phone,
  Mail,
  User,
  ExternalLink,
  RefreshCw,
  Clock
} from "lucide-react";

interface OrderDetailModalProps {
  order: any;
  metaMap: Record<string, { costPrice: number; margin: number; privateNotes?: string }>;
  onClose: () => void;
}

export default function OrderDetailModal({ order, metaMap, onClose }: OrderDetailModalProps) {
  const [tracking, setTracking] = useState<any>(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // Customer profile state
  const [customerProfile, setCustomerProfile] = useState<any>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  // Delhivery fulfillment state
  const [fulfilling, setFulfilling] = useState(false);
  const [fulfillmentError, setFulfillmentError] = useState<string | null>(null);
  const [manualWeight, setManualWeight] = useState("0.5");

  // Parse Razorpay IDs from Shopify Order Note
  const noteText = order.note || "";
  const orderIdMatch = noteText.match(/Order ID:\s*([^\s,]+)/i);
  const paymentIdMatch = noteText.match(/Payment ID:\s*([^\s,]+)/i);
  
  const razorpayOrderId = orderIdMatch ? orderIdMatch[1] : null;
  const razorpayPaymentId = paymentIdMatch ? paymentIdMatch[1] : null;

  // Extract Delhivery AWB if available in attributes or note
  const awbAttribute = order.customAttributes?.find((attr: any) => attr.key.toLowerCase() === "awb" || attr.key.toLowerCase() === "trackingid");
  let awb = awbAttribute ? awbAttribute.value : null;

  // Secondary fallback: parse AWB from notes or Redis summaries if not found in custom attributes
  if (!awb) {
    const awbMatch = noteText.match(/AWB:\s*([^\s,]+)/i);
    if (awbMatch) awb = awbMatch[1];
  }

  // Load Delhivery tracking info if AWB exists
  const fetchTrackingData = async () => {
    if (!awb) return;
    setLoadingTracking(true);
    setTrackingError(null);
    try {
      const res = await fetch(`/api/orders/track?awb=${encodeURIComponent(awb)}`);
      if (res.ok) {
        const data = await res.json();
        setTracking(data.tracking);
      } else {
        setTrackingError("No active courier tracking found yet.");
      }
    } catch {
      setTrackingError("Network error. Could not query logistics.");
    } finally {
      setLoadingTracking(false);
    }
  };

  const handleFulfillOrder = async () => {
    if (!order.shippingAddress) {
      setFulfillmentError("Cannot fulfill: No shipping address provided.");
      return;
    }
    setFulfilling(true);
    setFulfillmentError(null);
    try {
      const res = await fetch("/api/orders/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          orderName: order.name,
          customerName: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName || ""}`.trim(),
          phone: order.shippingAddress.phone || order.customer?.phone || "",
          address1: order.shippingAddress.address1,
          address2: order.shippingAddress.address2 || "",
          city: order.shippingAddress.city,
          province: order.shippingAddress.province,
          zip: order.shippingAddress.zip,
          weight: manualWeight,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFulfillmentError(data.error || "Failed to fulfill order.");
      } else {
        alert(data.message || "Order successfully booked and marked as fulfilled!");
        window.location.reload();
      }
    } catch {
      setFulfillmentError("Network error. Could not book shipment.");
    } finally {
      setFulfilling(false);
    }
  };

  useEffect(() => {
    fetchTrackingData();
  }, [awb]);

  useEffect(() => {
    if (order.customer?.id) {
      (async () => {
        setLoadingCustomer(true);
        try {
          const res = await fetch(`/api/orders/customer?id=${encodeURIComponent(order.customer.id)}`);
          if (res.ok) {
            const data = await res.json();
            setCustomerProfile(data.customer);
          }
        } catch (err) {
          console.error("Failed to load customer profile:", err);
        } finally {
          setLoadingCustomer(false);
        }
      })();
    }
  }, [order.customer?.id]);

  // Compute item margins and overall metrics
  let totalOrderCost = 0;
  const items = order.lineItems?.edges?.map((e: any) => {
    const node = e.node;
    const sku = node.sku || "";
    const qty = node.quantity || 1;
    const price = parseFloat(node.originalUnitPriceSet?.presentmentMoney?.amount || "0");
    
    const meta = metaMap[sku];
    const costPrice = meta?.costPrice || 0;
    const totalCost = costPrice * qty;
    totalOrderCost += totalCost;

    const profit = price - costPrice;
    const margin = price > 0 ? (profit / price) * 100 : 0;

    return {
      title: node.title,
      qty,
      sku,
      price,
      costPrice,
      profit,
      margin,
      privateNotes: meta?.privateNotes || ""
    };
  }) || [];

  const totalRetail = parseFloat(order.totalPriceSet?.presentmentMoney?.amount || "0");
  const netProfit = totalRetail - totalOrderCost;
  const overallMargin = totalRetail > 0 ? (netProfit / totalRetail) * 100 : 0;

  const getMarginColor = (margin: number) => {
    if (margin >= 40) return "text-green-600 bg-green-50 border border-green-200/50";
    if (margin >= 20) return "text-yellow-600 bg-yellow-50 border border-yellow-200/50";
    return "text-red-600 bg-red-50 border border-red-200/50";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm transition-opacity">
      {/* Sidebar Slider Panel */}
      <div className="w-full max-w-2xl bg-[#FAF8F5] h-full shadow-2xl flex flex-col relative transform transition-transform duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-[#4A154B]/10 bg-white flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-display font-bold text-[#4A154B]">{order.name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                order.displayFinancialStatus === "PAID" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}>
                {order.displayFinancialStatus}
              </span>
            </div>
            <p className="text-xs text-[#1A1A1A]/60 flex items-center gap-1 mt-1">
              <Calendar size={12} />
              Placed on {new Date(order.createdAt).toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </p>
          </div>
          
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-full hover:bg-red-50 text-[#1A1A1A]/40 hover:text-red-600 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Customer Profile & Shipping */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer info */}
            <div className="ui-card p-4 bg-white space-y-3">
              <h3 className="text-xs font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/5 pb-2 flex items-center gap-1.5">
                <User size={14} />
                Customer Profile
              </h3>
              <div className="space-y-2 text-xs">
                <p className="font-semibold text-sm">
                  {order.customer?.firstName} {order.customer?.lastName || "Customer"}
                </p>
                <p className="flex items-center gap-1.5 text-[#1A1A1A]/70">
                  <Phone size={12} />
                  {order.customer?.phone || "No Mobile Number Provided"}
                </p>
                {order.customer?.email && (
                  <p className="flex items-center gap-1.5 text-[#1A1A1A]/70">
                    <Mail size={12} />
                    {order.customer.email}
                  </p>
                )}
              </div>

              {loadingCustomer && (
                <div className="text-[10px] text-[#1A1A1A]/40 animate-pulse">Loading Shopify profile data...</div>
              )}

              {customerProfile && (
                <div className="pt-2 border-t border-[#4A154B]/5 space-y-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#1A1A1A]/50">Total Orders:</span>
                    <span className="font-bold text-[#4A154B]">{customerProfile.numberOfOrders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#1A1A1A]/50">Total Spent:</span>
                    <span className="font-bold text-[#4A154B]">₹{parseFloat(customerProfile.amountSpent?.amount || "0").toLocaleString("en-IN")}</span>
                  </div>

                  {customerProfile.addresses && customerProfile.addresses.length > 0 && (
                    <div className="pt-1.5">
                      <span className="text-[#1A1A1A]/50 block mb-1">Saved Addresses in Shopify:</span>
                      <div className="max-h-20 overflow-y-auto space-y-1 bg-[#FAF8F5] p-1.5 rounded border border-[#4A154B]/5 text-[10px] text-[#1A1A1A]/70">
                        {customerProfile.addresses.map((addr: any, idx: number) => (
                          <div key={idx} className="pb-1 border-b border-[#1A1A1A]/5 last:border-b-0 last:pb-0">
                            {addr.address1}, {addr.city} - {addr.zip}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Delivery address */}
            <div className="ui-card p-4 bg-white">
              <h3 className="text-xs font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/5 pb-2 flex items-center gap-1.5">
                <MapPin size={14} />
                Shipping Destination
              </h3>
              {order.shippingAddress ? (
                <div className="mt-3 text-xs space-y-1 text-[#1A1A1A]/80 leading-relaxed">
                  <p className="font-semibold">{order.shippingAddress.fullName}</p>
                  <p>{order.shippingAddress.address1}</p>
                  {order.shippingAddress.address2 && <p>{order.shippingAddress.address2}</p>}
                  <p>{order.shippingAddress.city}, {order.shippingAddress.province} - {order.shippingAddress.zip}</p>
                  {order.shippingAddress.phone && <p className="mt-1 font-medium">Contact: {order.shippingAddress.phone}</p>}
                </div>
              ) : (
                <p className="text-xs text-[#1A1A1A]/50 mt-3">No shipping details provided (digital or manual creation).</p>
              )}
            </div>
          </div>

          {/* Secure Cost Margins (Founder's Eyes Only) */}
          <div className="ui-card p-5 bg-[#4A154B]/5 border border-[#4A154B]/10 rounded-2xl relative overflow-hidden">
            <h3 className="text-xs font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/10 pb-2.5 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-[#D4AF37]" />
              Private Net Margin Metrics
            </h3>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/55">Order Value</span>
                <p className="text-lg font-display font-bold text-[#4A154B] mt-0.5">₹{totalRetail.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/55">Weaver Cost</span>
                <p className="text-lg font-display font-bold text-[#4A154B] mt-0.5">₹{totalOrderCost.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/55">Net Profit</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-lg font-display font-bold text-green-700">₹{netProfit.toLocaleString("en-IN")}</span>
                  <span className={`text-[10px] font-bold rounded-lg px-2 py-0.5 ${getMarginColor(overallMargin)}`}>
                    {Math.round(overallMargin)}%
                  </span>
                </div>
              </div>
            </div>
            <div className="absolute -right-6 -bottom-6 text-[#4A154B] opacity-5 font-bold font-display text-7xl select-none pointer-events-none">
              ₹
            </div>
          </div>

          {/* Saree Line Items */}
          <div className="ui-card p-5 bg-white">
            <h3 className="text-xs font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/5 pb-2.5 flex items-center gap-1.5 mb-4">
              <Package size={14} />
              Purchased sarees
            </h3>
            <div className="space-y-4">
              {items.map((item: any, i: number) => (
                <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-[#1A1A1A]/5 last:border-b-0 last:pb-0">
                  <div>
                    <h4 className="text-xs font-bold text-[#1A1A1A]">{item.title}</h4>
                    <p className="text-[10px] font-mono text-[#1A1A1A]/50 mt-1">SKU: {item.sku || "N/A"} | Qty: {item.qty}</p>
                    {item.privateNotes && (
                      <p className="text-[10px] bg-yellow-50 border border-yellow-200/50 text-[#D4AF37]/90 rounded px-2 py-1 mt-1.5 italic max-w-md">
                        <strong>Note:</strong> {item.privateNotes}
                      </p>
                    )}
                  </div>
                  
                  <div className="text-right flex items-center gap-4">
                    <div className="text-xs">
                      <p className="text-[#1A1A1A]/50">Retail: <span className="font-semibold text-[#1A1A1A]">₹{item.price.toLocaleString("en-IN")}</span></p>
                      <p className="text-[#1A1A1A]/50 mt-0.5">Weaver: <span className="font-semibold text-[#1A1A1A]">₹{item.costPrice.toLocaleString("en-IN")}</span></p>
                    </div>
                    
                    <span className={`text-[10px] font-bold rounded-lg px-2.5 py-1 ${getMarginColor(item.margin)}`}>
                      +{Math.round(item.margin)}% Margin
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Logistics & Tracking (Delhivery) */}
          <div className="ui-card p-5 bg-white">
            <div className="flex items-center justify-between border-b border-[#4A154B]/5 pb-2.5 mb-4">
              <h3 className="text-xs font-bold uppercase text-[#4A154B] flex items-center gap-1.5">
                <Truck size={14} className="text-[#D4AF37]" />
                Logistics Tracking (Delhivery)
              </h3>
              
              {awb && (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-[#4A154B] bg-[#4A154B]/5 px-2 py-0.5 rounded">
                    AWB: {awb}
                  </span>
                  <button 
                    type="button" 
                    onClick={fetchTrackingData}
                    className="p-1 rounded hover:bg-[#4A154B]/5 text-[#4A154B] transition-colors cursor-pointer"
                    title="Refresh timeline"
                  >
                    <RefreshCw size={14} className={loadingTracking ? "animate-spin" : ""} />
                  </button>
                </div>
              )}
            </div>

            {awb ? (
              /* Status Display */
              loadingTracking ? (
                <div className="text-xs text-[#1A1A1A]/60 flex items-center gap-2 py-4 justify-center">
                  <RefreshCw size={14} className="animate-spin text-[#4A154B]" />
                  Fetching live courier timeline...
                </div>
              ) : trackingError ? (
                <div className="text-xs text-[#1A1A1A]/55 text-center py-4 bg-[#FAF8F5] rounded-xl border border-dashed border-[#1A1A1A]/10">
                  <Clock size={20} className="mx-auto mb-2 text-[#1A1A1A]/30" />
                  {trackingError}
                </div>
              ) : tracking ? (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className="p-3 bg-[#D4AF37]/5 border border-[#D4AF37]/25 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-[#4A154B]">{tracking.status}</p>
                      {tracking.edd && <p className="text-[10px] text-[#1A1A1A]/65 mt-0.5">Est. Delivery: {tracking.edd}</p>}
                    </div>
                    {tracking.deliveredDate && (
                      <span className="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                        Delivered
                      </span>
                    )}
                  </div>

                  {/* Scanned activities timeline */}
                  <div className="relative ml-2.5 border-l border-[#4A154B]/15 pl-4 space-y-3.5 pt-1">
                    {tracking.activities?.slice(0, 4).map((activity: any, idx: number) => (
                      <div key={idx} className="relative text-xs">
                        <div className={`absolute left-[-21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#FAF8F5] ${
                          idx === 0 ? "bg-[#4A154B]" : "bg-[#1A1A1A]/30"
                        }`} />
                        <p className={`font-semibold ${idx === 0 ? "text-[#4A154B]" : "text-[#1A1A1A]/85"}`}>
                          {activity.activity}
                        </p>
                        {activity.location && <p className="text-[10px] text-[#1A1A1A]/60 mt-0.5">{activity.location}</p>}
                        <p className="text-[9px] text-[#1A1A1A]/45 mt-0.5">{activity.date}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#1A1A1A]/55 text-center py-4 bg-[#FAF8F5] rounded-xl border border-dashed border-[#1A1A1A]/10">
                  Awaiting courier manifestation.
                </div>
              )
            ) : (
              /* Fulfillment Fulfill actions */
              <div className="space-y-4 text-xs">
                <p className="text-[#1A1A1A]/60">
                  This order has not been fulfilled yet. Manifest shipment directly with Delhivery and push fulfillment status to Shopify.
                </p>

                <div className="flex flex-col gap-1.5 p-3.5 bg-[#FAF8F5] rounded-xl border border-[#4A154B]/5">
                  <label className="text-[10px] uppercase font-bold text-[#4A154B] tracking-wider">
                    Package Weight (kg)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={manualWeight}
                      onChange={(e) => setManualWeight(e.target.value)}
                      className="w-24 h-9 rounded-lg border border-[#4A154B]/10 px-2.5 bg-white text-xs outline-none focus:border-[#4A154B]"
                    />
                    <span className="text-xs text-[#1A1A1A]/50">kg (e.g. 0.5 for light boxes, 1.2 for bridal sarees)</span>
                  </div>
                </div>

                {fulfillmentError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200">
                    {fulfillmentError}
                  </div>
                )}
                <button
                  type="button"
                  disabled={fulfilling || !order.shippingAddress}
                  onClick={handleFulfillOrder}
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#4A154B] hover:bg-[#4A154B]/90 text-white font-bold py-3 px-4 rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer text-xs uppercase tracking-wider"
                >
                  <Truck size={14} />
                  {fulfilling ? "Manifesting with Delhivery..." : "Fulfill & Manifest with Delhivery"}
                </button>
              </div>
            )}
          </div>

          {/* Secure Payment details (Razorpay) */}
          <div className="ui-card p-4 bg-white">
            <h3 className="text-xs font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/5 pb-2 flex items-center gap-1.5">
              <CreditCard size={14} />
              Prepaid Payment secured (Razorpay)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
              <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#1A1A1A]/5">
                <span className="text-[10px] text-[#1A1A1A]/55 uppercase">Razorpay Order ID</span>
                <p className="font-mono mt-1 font-semibold text-[#4A154B]">{razorpayOrderId || "Awaiting Sync / COD"}</p>
              </div>
              <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#1A1A1A]/5">
                <span className="text-[10px] text-[#1A1A1A]/55 uppercase">Razorpay Payment ID</span>
                <p className="font-mono mt-1 font-semibold text-[#4A154B] flex items-center gap-1">
                  {razorpayPaymentId || "Awaiting Capture"}
                  {razorpayPaymentId && (
                    <a 
                      href={`https://dashboard.razorpay.com/app/payments/${razorpayPaymentId}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[#4A154B] hover:text-[#D4AF37]"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
