"use client";

import { useEffect, useState } from "react";
import { 
  X, 
  Package, 
  MapPin, 
  CreditCard, 
  TrendingUp, 
  Truck, 
  Calendar,
  Phone,
  Mail,
  User,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle2,
  Download
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

  const deliveryStatusAttr = order.customAttributes?.find((attr: any) => attr.key.toLowerCase() === "delivery_status");
  const initialDeliveryStatus = deliveryStatusAttr ? deliveryStatusAttr.value : (order.tags?.includes("delivery_status:delivered") ? "delivered" : "dispatched");
  const [currentDeliveryStatus, setCurrentDeliveryStatus] = useState(initialDeliveryStatus);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const pickupIdAttr = order.customAttributes?.find((attr: any) => attr.key.toLowerCase() === "pickup_id");
  const hasManualIndicators = order.customAttributes?.some((attr: any) => attr.key.toLowerCase() === "courier_partner") || order.tags?.some((t: string) => t.toLowerCase().startsWith("courier:"));
  const isManualFulfillment = !pickupIdAttr && hasManualIndicators;

  const getOrderCourierPartner = (order: any) => {
    const courierAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "courier_partner"
    );
    if (courierAttr?.value) return courierAttr.value;

    const courierTag = order.tags?.find((tag: string) => tag.toLowerCase().startsWith("courier:"));
    if (courierTag) return courierTag.split(":")[1]?.trim();

    return "Delhivery";
  };

  const handleMarkDelivered = async () => {
    setMarkingDelivered(true);
    try {
      const res = await fetch("/api/orders/fulfill-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action: "deliver" }),
      });
      if (res.ok) {
        setCurrentDeliveryStatus("delivered");
        alert("Order successfully marked as Delivered!");
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to mark delivered.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setMarkingDelivered(false);
    }
  };

  const [cachedAwb, setCachedAwb] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem(`awb_cache_${order.id}`);
      if (val) setCachedAwb(val);
    }
  }, [order.id]);

  // Extract Delhivery AWB if available in attributes or note
  const awbAttribute = order.customAttributes?.find((attr: any) => attr.key.toLowerCase() === "awb" || attr.key.toLowerCase() === "trackingid");
  let awb = awbAttribute ? awbAttribute.value : (cachedAwb || null);

  if (!awb) {
    const awbMatch = order.note?.match(/AWB:\s*([^\s,]+)/i);
    if (awbMatch) awb = awbMatch[1];
  }

  // Load tracking info if AWB exists
  const fetchTrackingData = async () => {
    if (!awb) return;
    setLoadingTracking(true);
    setTrackingError(null);
    try {
      const res = await fetch(`/api/orders/track?awb=${encodeURIComponent(awb)}&courier=${encodeURIComponent(getOrderCourierPartner(order))}&isManual=${isManualFulfillment}`);
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

  // Exact shipping charged to customer from Shopify
  const noteText = order.note || "";
  const courierCostMatch = noteText.match(/Courier Cost:\s*₹([\d.]+)/i);
  const actualCourierCostFromNote = courierCostMatch ? parseFloat(courierCostMatch[1]) : null;

  const totalRetail = parseFloat(order.totalPriceSet?.presentmentMoney?.amount || "0");
  const shippingDeduction = actualCourierCostFromNote !== null ? actualCourierCostFromNote : 0;
  
  // Margin: Net Profit = Retail Revenue - Weaver Costs - Actual Courier Cost
  const netProfit = totalRetail - totalOrderCost - shippingDeduction;
  const overallMargin = totalRetail > 0 ? (netProfit / totalRetail) * 100 : 0;
  
  // Gross profit ignoring shipping
  const grossProductProfit = totalRetail - totalOrderCost;
  const grossProductMargin = totalRetail > 0 ? (grossProductProfit / totalRetail) * 100 : 0;

  const getMarginColor = (margin: number) => {
    if (margin >= 40) return "text-green-600 bg-green-50 border border-green-200/50";
    if (margin >= 20) return "text-yellow-600 bg-yellow-50 border border-yellow-200/50";
    return "text-red-600 bg-red-50 border border-red-200/50";
  };

  const orderIdMatch = noteText.match(/Order ID:\s*([^\s,]+)/i);
  const paymentIdMatch = noteText.match(/Payment ID:\s*([^\s,]+)/i);
  const razorpayOrderId = orderIdMatch ? orderIdMatch[1] : null;
  const razorpayPaymentId = paymentIdMatch ? paymentIdMatch[1] : null;

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#4A154B]/40 backdrop-blur-md transition-opacity p-4 sm:p-6 md:p-8 animate-in fade-in duration-200"
    >
      {/* Centered Premium Overlay Modal Card */}
      <div className="w-full max-w-6xl bg-gradient-to-br from-white to-[#FAF8F5] max-h-[95vh] rounded-3xl shadow-[0_25px_70px_-10px_rgba(74,21,75,0.2)] flex flex-col relative overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-[#4A154B]/15">
        
        {/* Header */}
        <div className="p-6 border-b border-[#4A154B]/10 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-extrabold text-[#4A154B] tracking-tight">{order.name}</h2>
              <span className={`px-3 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider border ${
                order.displayFinancialStatus === "PAID" 
                  ? "bg-green-50 text-green-700 border-green-200" 
                  : "bg-yellow-50 text-yellow-700 border-yellow-200"
              }`}>
                {order.displayFinancialStatus}
              </span>
            </div>
            <p className="text-sm text-[#1A1A1A]/50 flex items-center gap-1">
              <Calendar size={12} className="text-[#4A154B]/70" />
              Placed on {new Date(order.createdAt).toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </p>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <a
              href={`/api/orders/receipt?orderId=${encodeURIComponent(order.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider bg-white hover:bg-gray-50 text-[#4A154B] border border-[#4A154B]/20 no-underline transition-all shadow-sm cursor-pointer"
            >
              <Download size={14} />
              <span>Receipt</span>
            </a>
            {awb && !isManualFulfillment && (!tracking?.status || (!tracking.status.toLowerCase().includes("transit") && !tracking.status.toLowerCase().includes("picked") && !tracking.status.toLowerCase().includes("shipped") && tracking.status.toLowerCase() !== "delivered")) && (
              <a
                href={`/api/orders/packing-slip?awb=${awb}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white shadow-sm border border-[#D4AF37]/20 no-underline transition-all cursor-pointer"
              >
                <span>Label 📦</span>
              </a>
            )}
            <button 
              type="button" 
              onClick={onClose} 
              className="w-8 h-8 rounded-full bg-white hover:bg-red-50 text-[#1A1A1A]/60 hover:text-red-600 border border-gray-200 hover:border-red-100 transition-all flex items-center justify-center cursor-pointer shadow-sm ml-2 active:scale-95"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Customer Profile & Shipping */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer info */}
            <div className="bg-white rounded-2xl p-5 border border-[#4A154B]/10 shadow-sm space-y-3.5">
              <h3 className="text-sm font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/5 pb-2 flex items-center gap-1.5 tracking-wider">
                <User size={14} className="text-[#D4AF37]" />
                Customer Profile
              </h3>
              <div className="space-y-2.5 text-sm text-[#1A1A1A]">
                <p className="font-bold text-base text-[#4A154B]">
                  {customerProfile && (customerProfile.firstName || customerProfile.lastName)
                    ? `${customerProfile.firstName || ""} ${customerProfile.lastName || ""}`.trim()
                    : order.customer && (order.customer.firstName || order.customer.lastName)
                    ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
                    : order.shippingAddress && (order.shippingAddress.firstName || order.shippingAddress.lastName)
                    ? `${order.shippingAddress.firstName || ""} ${order.shippingAddress.lastName || ""}`.trim()
                    : "Customer"}
                </p>
                <p className="flex items-center gap-2 text-[#1A1A1A]/70 font-medium">
                  <Phone size={13} className="text-[#4A154B]/50" />
                  {order.customer?.phone || "No Mobile Number"}
                </p>
                {order.customer?.email && (
                  <p className="flex items-center gap-2 text-[#1A1A1A]/70 font-medium truncate">
                    <Mail size={13} className="text-[#4A154B]/50" />
                    {order.customer.email}
                  </p>
                )}
              </div>

              {loadingCustomer && (
                <div className="text-xs text-[#4A154B] animate-pulse">Loading Shopify profile data...</div>
              )}

              {customerProfile && (
                <div className="pt-3 border-t border-[#4A154B]/10 flex justify-between gap-4 text-sm font-medium">
                  <div className="flex-1 bg-[#FAF8F5] p-2 rounded-xl border border-[#4A154B]/5 text-center">
                    <span className="text-xs text-[#1A1A1A]/40 uppercase font-bold block mb-0.5">Orders</span>
                    <span className="font-extrabold text-[#4A154B] text-base">{customerProfile.numberOfOrders}</span>
                  </div>
                  <div className="flex-1 bg-[#FAF8F5] p-2 rounded-xl border border-[#4A154B]/5 text-center">
                    <span className="text-xs text-[#1A1A1A]/40 uppercase font-bold block mb-0.5">Total Spent</span>
                    <span className="font-extrabold text-green-700 text-base">₹{parseFloat(customerProfile.amountSpent?.amount || "0").toLocaleString("en-IN")}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Delivery address */}
            <div className="bg-white rounded-2xl p-5 border border-[#4A154B]/10 shadow-sm space-y-3">
              <h3 className="text-sm font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/5 pb-2 flex items-center gap-1.5 tracking-wider">
                <MapPin size={14} className="text-[#D4AF37]" />
                Shipping Destination
              </h3>
              {order.shippingAddress ? (
                <div className="mt-3 text-sm space-y-1.5 text-[#1A1A1A]/80 leading-relaxed font-medium">
                  <p className="font-bold text-[#1A1A1A]">{[order.shippingAddress.firstName, order.shippingAddress.lastName].filter(Boolean).join(" ") || "Customer"}</p>
                  <p>{order.shippingAddress.address1}</p>
                  {order.shippingAddress.address2 && <p>{order.shippingAddress.address2}</p>}
                  <p className="text-[#4A154B] font-semibold">{order.shippingAddress.city}, {order.shippingAddress.province} - {order.shippingAddress.zip}</p>
                  {order.shippingAddress.phone && <p className="mt-2 text-[#1A1A1A]/60 font-semibold text-sm">Phone: {order.shippingAddress.phone}</p>}
                </div>
              ) : (
                <p className="text-sm text-[#1A1A1A]/45 italic py-4">No shipping address details available.</p>
              )}
            </div>
          </div>

          {/* Saree Line Items */}
          <div className="bg-white rounded-2xl p-5 border border-[#4A154B]/10 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/5 pb-2 flex items-center gap-1.5 tracking-wider">
              <Package size={14} className="text-[#D4AF37]" />
              Ordered Items
            </h3>
            <div className="divide-y divide-[#4A154B]/5">
              {items.map((item: any, i: number) => (
                <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-[#1A1A1A]">{item.title}</h4>
                    <p className="text-sm text-[#1A1A1A]/50 font-bold">SKU: {item.sku || "N/A"} | Qty: {item.qty}</p>
                    {item.privateNotes && (
                      <div className="text-sm bg-yellow-50/70 border border-yellow-200/50 text-[#D4AF37]/90 rounded-lg px-2.5 py-1.5 mt-1.5 italic max-w-lg font-medium">
                        <strong>Note:</strong> {item.privateNotes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Prepaid Payment secured info */}
            <div className="mt-4 pt-4 border-t border-[#4A154B]/10 space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-bold uppercase text-[#4A154B] tracking-wider">
                <CreditCard size={14} className="text-[#D4AF37]" />
                <span>Prepaid Payment Secured (Razorpay)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#4A154B]/5">
                  <span className="text-xs text-[#1A1A1A]/40 uppercase font-bold">Razorpay Order ID</span>
                  <p className="mt-1 font-bold text-[#4A154B] text-sm">{razorpayOrderId || "COD / Sync Required"}</p>
                </div>
                <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#4A154B]/5">
                  <span className="text-xs text-[#1A1A1A]/40 uppercase font-bold">Razorpay Payment ID</span>
                  <p className="mt-1 font-bold text-[#4A154B] text-sm flex items-center justify-between gap-1">
                    <span>{razorpayPaymentId || "Awaiting Capture"}</span>
                    {razorpayPaymentId && (
                      <a 
                        href={`https://dashboard.razorpay.com/app/payments/${razorpayPaymentId}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[#4A154B] hover:text-[#D4AF37] p-1 hover:bg-[#4A154B]/5 rounded transition-all"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Secure Cost Margins */}
          <div className="p-5 bg-gradient-to-br from-[#4A154B]/5 to-transparent border border-[#4A154B]/15 rounded-3xl relative overflow-hidden shadow-inner">
            <h3 className="text-sm font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/10 pb-2.5 flex items-center gap-1.5 tracking-wider">
              <TrendingUp size={14} className="text-[#D4AF37]" />
              Private Net Margin Metrics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 relative z-10">
              <div className="bg-white/80 p-3 rounded-2xl border border-[#4A154B]/5">
                <span className="text-xs uppercase font-bold text-[#1A1A1A]/40 block mb-0.5">Order Value</span>
                <p className="text-xl font-extrabold text-[#4A154B]">₹{totalRetail.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-white/80 p-3 rounded-2xl border border-[#4A154B]/5">
                <span className="text-xs uppercase font-bold text-[#1A1A1A]/40 block mb-0.5">Weaver Cost</span>
                <p className="text-xl font-extrabold text-[#4A154B]">₹{totalOrderCost.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-white/80 p-3 rounded-2xl border border-[#4A154B]/5">
                <span className="text-xs uppercase font-bold text-[#1A1A1A]/40 block mb-0.5">Courier Cost</span>
                <p className="text-xl font-extrabold text-rose-600">
                  ₹{shippingDeduction.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="bg-white/80 p-3 rounded-2xl border border-[#4A154B]/5">
                <span className="text-xs uppercase font-bold text-[#1A1A1A]/40 block mb-0.5">Net Profit</span>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xl font-extrabold text-green-700">₹{netProfit.toLocaleString("en-IN")}</span>
                  <span className={`text-sm font-extrabold rounded-full px-2.5 py-0.5 ${getMarginColor(overallMargin)}`}>
                    {Math.round(overallMargin)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="absolute right-3 bottom-0 text-[#4A154B] opacity-5 font-bold text-9xl select-none pointer-events-none">
              ₹
            </div>
          </div>

          {/* Logistics & Tracking (Delhivery / Shiprocket) */}
          {awb && (
            <div className="bg-white rounded-2xl p-5 border border-[#4A154B]/10 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#4A154B]/5 pb-2.5 mb-4">
                <h3 className="text-sm font-bold uppercase text-[#4A154B] flex items-center gap-1.5 tracking-wider">
                  <Truck size={14} className="text-[#D4AF37]" />
                  Logistics Tracking & Fulfillment
                </h3>
                
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[#4A154B] bg-[#4A154B]/5 px-2 py-0.5 rounded border border-[#4A154B]/10">
                    {getOrderCourierPartner(order)}
                  </span>
                  <span className="text-sm font-bold text-[#4A154B] bg-[#4A154B]/5 px-2 py-0.5 rounded border border-[#4A154B]/10">
                    AWB: {awb}
                  </span>
                  {!isManualFulfillment && (
                    <a
                      href={`/api/orders/packing-slip?awb=${awb}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-[#4A154B] hover:bg-[#4A154B]/95 px-3 py-1 rounded-lg transition-all no-underline"
                    >
                      Label
                    </a>
                  )}
                  <button 
                    type="button" 
                    onClick={fetchTrackingData}
                    className="p-1 rounded-lg hover:bg-[#4A154B]/5 text-[#4A154B] transition-colors border border-transparent hover:border-[#4A154B]/10 cursor-pointer"
                    title="Refresh timeline"
                  >
                    <RefreshCw size={13} className={loadingTracking ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {currentDeliveryStatus === "delivered" && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between text-sm text-green-800 font-bold shadow-sm">
                    <span>Order has been manually marked as Delivered.</span>
                    <span className="bg-green-100 text-green-700 font-extrabold px-2.5 py-0.5 rounded-full text-sm uppercase border border-green-300">
                      Delivered
                    </span>
                  </div>
                )}

                {/* Status Display */}
                {loadingTracking ? (
                  <div className="text-xs text-[#1A1A1A]/60 flex items-center gap-2 py-6 justify-center">
                    <RefreshCw size={16} className="animate-spin text-[#4A154B]" />
                    Fetching live courier timeline...
                  </div>
                ) : trackingError ? (
                  <div className="text-xs text-[#1A1A1A]/55 text-center py-6 bg-[#FAF8F5] rounded-xl border border-dashed border-[#4A154B]/15">
                    <Clock size={24} className="mx-auto mb-2 text-[#4A154B]/40 animate-pulse" />
                    {trackingError}
                  </div>
                ) : tracking ? (
                  <div className="space-y-4">
                    {/* Status Banner */}
                    <div className="p-3.5 bg-[#FAF8F5] border border-[#4A154B]/10 rounded-2xl flex items-center justify-between text-sm shadow-sm">
                      <div>
                        <p className="font-extrabold text-[#4A154B] text-base">{tracking.status}</p>
                        {tracking.edd && <p className="text-sm text-[#1A1A1A]/50 mt-1 font-bold">Estimated Delivery: {tracking.edd}</p>}
                      </div>
                      {tracking.deliveredDate && (
                        <span className="bg-green-100 text-green-700 font-extrabold px-2.5 py-0.5 rounded-full text-sm uppercase border border-green-300">
                          Delivered
                        </span>
                      )}
                    </div>

                    {/* Scanned activities */}
                    <div className="relative ml-3 border-l-2 border-[#4A154B]/15 pl-5 space-y-4 pt-1">
                      {tracking.activities?.slice(0, 4).map((activity: any, idx: number) => (
                        <div key={idx} className="relative text-sm">
                          <div className={`absolute left-[-26px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm ${
                            idx === 0 ? "bg-[#4A154B] scale-110 ring-2 ring-[#4A154B]/20" : "bg-gray-300"
                          }`} />
                          <p className={`font-bold ${idx === 0 ? "text-[#4A154B] text-base" : "text-[#1A1A1A]/80"}`}>
                            {activity.activity}
                          </p>
                          {activity.location && <p className="text-sm text-[#1A1A1A]/55 mt-0.5 font-semibold">{activity.location}</p>}
                          <p className="text-xs text-[#1A1A1A]/40 mt-0.5 font-sans">{activity.date}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#1A1A1A]/55 text-center py-6 bg-[#FAF8F5] rounded-xl border border-dashed border-[#4A154B]/15">
                    Awaiting courier manifestation.
                  </div>
                )}

                {isManualFulfillment && currentDeliveryStatus !== "delivered" && (
                  <div className="mt-4 pt-4 border-t border-[#4A154B]/5 flex justify-end">
                    <button
                      type="button"
                      onClick={handleMarkDelivered}
                      disabled={markingDelivered}
                      className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-green-600 hover:bg-green-700 text-white shadow-md transition-all cursor-pointer disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {markingDelivered ? "Updating..." : "Mark Delivered"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
