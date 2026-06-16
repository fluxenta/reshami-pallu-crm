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
  CheckCircle2
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

  // Parse Razorpay IDs from Shopify Order Note
  const noteText = order.note || "";
  const orderIdMatch = noteText.match(/Order ID:\s*([^\s,]+)/i);
  const paymentIdMatch = noteText.match(/Payment ID:\s*([^\s,]+)/i);
  
  const razorpayOrderId = orderIdMatch ? orderIdMatch[1] : null;
  const razorpayPaymentId = paymentIdMatch ? paymentIdMatch[1] : null;

  // Parse shipping details from order note
  const courierCostMatch = noteText.match(/Courier Cost:\s*₹([\d.]+)/i);
  const actualCourierCostFromNote = courierCostMatch ? parseFloat(courierCostMatch[1]) : null;

  // Exact shipping charged to customer from Shopify
  const shopifyShippingAmount = parseFloat(
    order.shippingLines?.edges?.[0]?.node?.originalPriceSet?.presentmentMoney?.amount ||
    order.totalShippingPriceSet?.presentmentMoney?.amount ||
    "0"
  );

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

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md transition-opacity p-4 sm:p-6 md:p-8"
    >
      {/* Centered Premium Overlay Modal Card */}
      <div className="w-full max-w-4xl bg-[#FAF8F5] max-h-[90vh] rounded-3xl shadow-2xl flex flex-col relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-[#4A154B]/10">
        
        {/* Header */}
        <div className="p-6 border-b border-[#4A154B]/10 bg-white flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-display font-bold text-[#4A154B]">{order.name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                order.displayFinancialStatus === "PAID" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}>
                {order.displayFinancialStatus}
              </span>
              <a
                href={`/api/orders/receipt?orderId=${encodeURIComponent(order.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#4A154B] hover:bg-[#4A154B]/95 text-white border border-[#4A154B]/20 no-underline transition-all shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Download PDF Receipt 📄</span>
              </a>
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
                  {customerProfile && (customerProfile.firstName || customerProfile.lastName)
                    ? `${customerProfile.firstName || ""} ${customerProfile.lastName || ""}`.trim()
                    : order.customer && (order.customer.firstName || order.customer.lastName)
                    ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
                    : order.shippingAddress && (order.shippingAddress.firstName || order.shippingAddress.lastName)
                    ? `${order.shippingAddress.firstName || ""} ${order.shippingAddress.lastName || ""}`.trim()
                    : "Customer"}
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

          {/* Saree Line Items — MOVED TO TOP OF LOGISTICS */}
          <div className="ui-card p-5 bg-white">
            <h3 className="text-xs font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/5 pb-2.5 flex items-center gap-1.5 mb-4">
              <Package size={14} />
              Ordered Items
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
                </div>
              ))}
            </div>

            {/* Prepaid Payment secured (Razorpay) info merged here */}
            <div className="mt-4 pt-4 border-t border-[#1A1A1A]/5 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#4A154B]">
                <CreditCard size={14} />
                <span>Prepaid Payment Secured (Razorpay)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-[#FAF8F5] rounded-lg border border-[#1A1A1A]/5">
                  <span className="text-[9px] text-[#1A1A1A]/55 uppercase font-bold">Razorpay Order ID</span>
                  <p className="font-mono mt-0.5 font-semibold text-[#4A154B] text-[11px]">{razorpayOrderId || "Awaiting Sync / COD"}</p>
                </div>
                <div className="p-2.5 bg-[#FAF8F5] rounded-lg border border-[#1A1A1A]/5">
                  <span className="text-[9px] text-[#1A1A1A]/55 uppercase font-bold">Razorpay Payment ID</span>
                  <p className="font-mono mt-0.5 font-semibold text-[#4A154B] text-[11px] flex items-center gap-1">
                    {razorpayPaymentId || "Awaiting Capture"}
                    {razorpayPaymentId && (
                      <a 
                        href={`https://dashboard.razorpay.com/app/payments/${razorpayPaymentId}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[#4A154B] hover:text-[#D4AF37]"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Secure Cost Margins (Founder's Eyes Only) */}
          <div className="ui-card p-5 bg-[#4A154B]/5 border border-[#4A154B]/10 rounded-2xl relative overflow-hidden">
            <h3 className="text-xs font-bold uppercase text-[#4A154B] border-b border-[#4A154B]/10 pb-2.5 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-[#D4AF37]" />
              Private Net Margin Metrics
            </h3>
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/55">Order Value</span>
                <p className="text-base font-display font-bold text-[#4A154B] mt-0.5">₹{totalRetail.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/55">Weaver Cost</span>
                <p className="text-base font-display font-bold text-[#4A154B] mt-0.5">₹{totalOrderCost.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/55">Actual Courier Cost</span>
                <p className="text-base font-display font-bold text-rose-700 mt-0.5">
                  ₹{shippingDeduction.toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1A1A1A]/55">Net Profit</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-base font-display font-bold text-green-700">₹{netProfit.toLocaleString("en-IN")}</span>
                  <span className={`text-[9px] font-bold rounded-lg px-2 py-0.5 ${getMarginColor(overallMargin)}`}>
                    {Math.round(overallMargin)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="absolute -right-6 -bottom-6 text-[#4A154B] opacity-5 font-bold font-display text-7xl select-none pointer-events-none">
              ₹
            </div>
          </div>

          {/* Logistics & Tracking (Delhivery / Shiprocket) */}
          {awb && (
            <div className="ui-card p-5 bg-white">
              <div className="flex items-center justify-between border-b border-[#4A154B]/5 pb-2.5 mb-4">
                <h3 className="text-xs font-bold uppercase text-[#4A154B] flex items-center gap-1.5">
                  <Truck size={14} className="text-[#D4AF37]" />
                  Logistics Tracking & Fulfillment
                </h3>
                
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-[#4A154B] bg-[#4A154B]/5 px-1.5 py-0.5 rounded">
                    AWB: {awb}
                  </span>
                  <a
                    href={`/api/orders/packing-slip?awb=${awb}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white bg-[#4A154B] hover:bg-[#4A154B]/95 px-2.5 py-1.5 rounded-md transition-all no-underline"
                  >
                    Download Label
                  </a>
                  <button 
                    type="button" 
                    onClick={fetchTrackingData}
                    className="p-1 rounded hover:bg-[#4A154B]/5 text-[#4A154B] transition-colors cursor-pointer"
                    title="Refresh timeline"
                  >
                    <RefreshCw size={12} className={loadingTracking ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                {currentDeliveryStatus === "delivered" && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between text-xs text-green-800 font-semibold">
                    <span>Order has been manually marked as Delivered.</span>
                    <span className="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                      Delivered
                    </span>
                  </div>
                )}

                {/* Status Display */}
                {loadingTracking ? (
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
                )}

                {currentDeliveryStatus !== "delivered" && (
                  <div className="mt-4 pt-4 border-t border-[#4A154B]/5 flex justify-end">
                    <button
                      type="button"
                      onClick={handleMarkDelivered}
                      disabled={markingDelivered}
                      className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-green-600 hover:bg-green-700 text-white shadow transition-all cursor-pointer disabled:opacity-50"
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
