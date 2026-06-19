"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Search, 
  Eye, 
  Calendar, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  Package,
  Receipt,
  Truck,
  MoreVertical,
  Download,
  Pencil
} from "lucide-react";
import OrderDetailModal from "./OrderDetailModal";

interface OrdersListTableProps {
  initialOrders: any[];
  metaMap: Record<string, { costPrice: number; margin: number; privateNotes?: string }>;
}

export default function OrdersListTable(props: OrdersListTableProps) {
  return (
    <Suspense fallback={
      <div className="p-12 text-center text-[#1A1A1A]/40 font-medium">
        <Package size={32} className="mx-auto mb-2 opacity-30 animate-spin" />
        Loading orders...
      </div>
    }>
      <OrdersListTableContent {...props} />
    </Suspense>
  );
}

function OrdersListTableContent({ initialOrders, metaMap }: OrdersListTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // Daily Pickup slots state
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [pickupSuccess, setPickupSuccess] = useState<string | null>(null);
  const [showScheduler, setShowScheduler] = useState(false);

  const [availableDays, setAvailableDays] = useState<Array<{ date: string, label: string, slots: Array<{ value: string, label: string }> }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);

  // Bulk Processing States
  const [selectedUnfulfilled, setSelectedUnfulfilled] = useState<Record<string, boolean>>({});
  const [orderDimensions, setOrderDimensions] = useState<Record<string, { weightGrams: string, length: string, width: string, height: string }>>({});
  const [inTransitPickups, setInTransitPickups] = useState<Record<string, boolean>>({});

  const searchParams = useSearchParams();
  const orderNameParam = searchParams.get("name");
  const orderIdParam = searchParams.get("id");

  useEffect(() => {
    if (orderNameParam || orderIdParam) {
      const found = initialOrders.find(
        (o) =>
          (orderNameParam && o.name === orderNameParam) ||
          (orderIdParam && o.id === orderIdParam)
      );
      if (found) {
        setSelectedOrder(found);
      }
    }
  }, [orderNameParam, orderIdParam, initialOrders]);

  useEffect(() => {
    async function loadSlots() {
      try {
        const res = await fetch("/api/orders/pickup/slots");
        if (res.ok) {
          const data = await res.json();
          if (data.availableDays && data.availableDays.length > 0) {
            setAvailableDays(data.availableDays);
            setPickupDate(data.availableDays[0].date);
            if (data.availableDays[0].slots.length > 0) {
              setPickupTime(data.availableDays[0].slots[0].value);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load Delhivery pickup slots:", err);
      } finally {
        setLoadingSlots(false);
      }
    }
    loadSlots();
  }, []);

  const selectedDay = availableDays.find(d => d.date === pickupDate);
  const currentSlots = selectedDay ? selectedDay.slots : [];

  // Compute helper methods for orders
  const getOrderAwb = (order: any) => {
    const awbAttribute = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "awb" || attr.key.toLowerCase() === "trackingid"
    );
    let awb = awbAttribute ? awbAttribute.value : null;
    if (!awb && order.note) {
      const awbMatch = order.note.match(/AWB:\s*([^\s,]+)/i);
      if (awbMatch) awb = awbMatch[1];
    }
    return awb;
  };

  const getOrderPickupDetails = (order: any) => {
    const pickupIdAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "pickup_id"
    );
    const pickupDateAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "pickup_date"
    );
    const pickupTimeAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "pickup_time"
    );

    if (pickupIdAttr?.value) {
      return {
        id: pickupIdAttr.value,
        date: pickupDateAttr?.value || "N/A",
        time: pickupTimeAttr?.value || "N/A"
      };
    }
    return null;
  };

  const getOrderNetMargin = (order: any) => {
    let totalOrderCost = 0;
    order.lineItems?.edges?.forEach((e: any) => {
      const node = e.node;
      const sku = node.sku || "";
      const qty = node.quantity || 1;
      const meta = metaMap[sku];
      totalOrderCost += (meta?.costPrice || 0) * qty;
    });

    const totalRetail = parseFloat(order.totalPriceSet?.presentmentMoney?.amount || "0");
    const profit = totalRetail - totalOrderCost;
    const marginPercent = totalRetail > 0 ? (profit / totalRetail) * 100 : 0;
    return { totalRetail, totalOrderCost, profit, marginPercent };
  };

  // Derive unfulfilled order lists (processing status and no AWB registered yet)
  const unfulfilledOrders = initialOrders.filter((o) => {
    return o.displayFulfillmentStatus !== "FULFILLED" && !getOrderAwb(o) && o.shippingAddress;
  });

  // Derived list of manifested shipments awaiting pickup
  const manifestedAwaitingPickup = initialOrders.filter((order) => {
    const awb = getOrderAwb(order);
    const pickup = getOrderPickupDetails(order);
    const hasPickup = !!pickup || order.tags?.includes("Pickup Scheduled");
    return !!awb && !hasPickup;
  });

  // Scheduled pickups summaries
  const scheduledPickups = initialOrders.reduce((acc: any[], order) => {
    const pickup = getOrderPickupDetails(order);
    if (pickup) {
      const existing = acc.find(p => p.id === pickup.id);
      if (!existing) {
        acc.push({
          id: pickup.id,
          date: pickup.date,
          time: pickup.time,
          ordersCount: 1,
          orders: [order.name]
        });
      } else {
        existing.ordersCount += 1;
        existing.orders.push(order.name);
      }
    }
    return acc;
  }, []);

  useEffect(() => {
    scheduledPickups.forEach((sp: any) => {
      if (sp.orders.length > 0 && !inTransitPickups[sp.id]) {
        const orderObj = initialOrders.find(o => o.name === sp.orders[0]);
        if (orderObj) {
          const awb = getOrderAwb(orderObj);
          const courier = getOrderCourierPartner(orderObj);
          if (awb) {
            fetch(`/api/orders/track?awb=${encodeURIComponent(awb)}&courier=${encodeURIComponent(courier)}&isManual=false`)
              .then(res => res.json())
              .then(data => {
                if (data?.ok && data?.tracking?.status) {
                  const s = data.tracking.status.toLowerCase();
                  if (s.includes("transit") || s.includes("out for") || s.includes("deliv") || s.includes("picked") || s.includes("shipped") || s === "pickup" || s === "in_transit") {
                    setInTransitPickups(prev => ({ ...prev, [sp.id]: true }));
                  }
                }
              })
              .catch(() => {});
          }
        }
      }
    });
  }, [JSON.stringify(scheduledPickups.map(s => s.id))]);

  const manifestedOrders = initialOrders.filter((order) => !!getOrderAwb(order));

  // Initialize defaults for checked items
  const handleToggleUnfulfilled = (orderId: string) => {
    setSelectedUnfulfilled(prev => {
      const isChecking = !prev[orderId];
      const next = { ...prev, [orderId]: isChecking };
      
      if (isChecking && !orderDimensions[orderId]) {
        setOrderDimensions(dims => ({
          ...dims,
          [orderId]: {
            weightGrams: "500", // Default: 500 grams (0.5 kg)
            length: "30",       // Default: 30 cm
            width: "20",        // Default: 20 cm
            height: "5"         // Default: 5 cm
          }
        }));
      }
      return next;
    });
  };

  const handleDimensionChange = (orderId: string, field: string, value: string) => {
    setOrderDimensions(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value.replace(/\D/g, "")
      }
    }));
  };

  // Submit Handler for Bulk Process
  const handleBulkManifestAndPickup = async () => {
    const checkedOrderIds = Object.keys(selectedUnfulfilled).filter(id => selectedUnfulfilled[id]);
    if (checkedOrderIds.length === 0) return;

    setScheduling(true);
    setPickupError(null);
    setPickupSuccess(null);

    const ordersData = checkedOrderIds.map(id => ({
      orderId: id,
      weightGrams: orderDimensions[id]?.weightGrams || "500",
      length: orderDimensions[id]?.length || "30",
      width: orderDimensions[id]?.width || "20",
      height: orderDimensions[id]?.height || "5"
    }));

    try {
      const res = await fetch("/api/orders/bulk-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: ordersData,
          pickupDate,
          pickupTime
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setPickupError(data.error || "Failed to process bulk manifests & scheduling.");
      } else {
        let msg = `Successfully processed ${ordersData.length} orders! AWB registered.`;
        if (data.pickupId && data.pickupId !== "N/A") {
          msg += ` Scheduled Delhivery Pickup ID: ${data.pickupId}`;
        }
        if (data.pickupError) {
          msg += ` (Logistics pickup schedule warning: ${data.pickupError})`;
        }
        setPickupSuccess(msg);
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    } catch {
      setPickupError("Network error. Could not complete bulk workflow request.");
    } finally {
      setScheduling(false);
    }
  };

  // Legacy scheduled pickups handlers
  const handleScheduleDailyPickup = async () => {
    if (manifestedAwaitingPickup.length === 0) {
      setPickupError("No manifested shipments are currently awaiting pickup.");
      return;
    }

    setScheduling(true);
    setPickupError(null);
    setPickupSuccess(null);

    try {
      const orderIds = manifestedAwaitingPickup.map(o => o.id);
      const res = await fetch("/api/orders/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds,
          pickupDate,
          pickupTime,
          expectedCount: manifestedAwaitingPickup.length
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPickupError(data.error || "Failed to schedule daily pickup.");
      } else {
        setPickupSuccess(
          `Successfully scheduled pickup (ID: ${data.pickupId}) for ${manifestedAwaitingPickup.length} packages on ${pickupDate}!`
        );
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch {
      setPickupError("Network error. Could not request pickup.");
    } finally {
      setScheduling(false);
    }
  };

  const [cancellingPickupId, setCancellingPickupId] = useState<string | null>(null);

  const handleCancelPickup = async (pickupId: string, orderNames: string[]) => {
    const matchedOrderIds = initialOrders
      .filter(o => orderNames.includes(o.name))
      .map(o => o.id);

    if (matchedOrderIds.length === 0) return;

    if (!confirm("Are you sure you want to cancel/clear this pickup request in the CRM? This will allow you to reschedule a new pickup.")) {
      return;
    }

    setCancellingPickupId(pickupId);
    try {
      const res = await fetch("/api/orders/pickup/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: matchedOrderIds }),
      });
      if (res.ok) {
        alert("Pickup successfully cleared in CRM.");
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to clear pickup.");
      }
    } catch {
      alert("Network error. Could not clear pickup.");
    } finally {
      setCancellingPickupId(null);
    }
  };

  // Manual Fulfillment States
  const [manualFulfillOrderId, setManualFulfillOrderId] = useState<string | null>(null);
  const [manualAwb, setManualAwb] = useState("");
  const [manualCourier, setManualCourier] = useState("");
  const [manualFulfilling, setManualFulfilling] = useState(false);

  const [editingAwbOrderId, setEditingAwbOrderId] = useState<string | null>(null);
  const [newAwbValue, setNewAwbValue] = useState("");
  const [editingCourier, setEditingCourier] = useState("");
  const [updatingAwb, setUpdatingAwb] = useState(false);

  const getOrderCourierPartner = (order: any) => {
    const courierAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "courier_partner"
    );
    if (courierAttr?.value) return courierAttr.value;

    const courierTag = order.tags?.find((tag: string) => tag.toLowerCase().startsWith("courier:"));
    if (courierTag) return courierTag.split(":")[1]?.trim();

    return "Delhivery";
  };

  const handleUpdateAwb = async (orderId: string, courierPartner: string) => {
    if (!newAwbValue.trim()) {
      alert("Please enter a valid AWB number.");
      return;
    }
    setUpdatingAwb(true);
    try {
      const res = await fetch("/api/orders/fulfill-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          awb: newAwbValue.trim(),
          courierPartner,
          action: "dispatch",
        }),
      });
      if (res.ok) {
        alert("AWB successfully updated!");
        setEditingAwbOrderId(null);
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update AWB.");
      }
    } catch {
      alert("Network error occurred.");
    } finally {
      setUpdatingAwb(false);
    }
  };

  const handleManualFulfillSubmit = async (orderId: string) => {
    if (!manualAwb || !manualCourier) {
      alert("Please enter AWB number and select Courier Partner.");
      return;
    }
    setManualFulfilling(true);
    try {
      const res = await fetch("/api/orders/fulfill-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          awb: manualAwb,
          courierPartner: manualCourier,
          action: "dispatch",
        }),
      });
      if (res.ok) {
        alert("Order successfully manually fulfilled (dispatched)!");
        setManualFulfillOrderId(null);
        setManualAwb("");
        setManualCourier("");
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to manually fulfill order.");
      }
    } catch {
      alert("Network error occurred.");
    } finally {
      setManualFulfilling(false);
    }
  };

  const handleMarkDeliveredSubmit = async (orderId: string) => {
    setManualFulfilling(true);
    try {
      const res = await fetch("/api/orders/fulfill-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          action: "deliver",
        }),
      });
      if (res.ok) {
        alert("Order successfully marked as Delivered!");
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to mark delivered.");
      }
    } catch {
      alert("Network error occurred.");
    } finally {
      setManualFulfilling(false);
    }
  };

  const filteredOrders = initialOrders.filter((order) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const orderName = String(order.name || "").toLowerCase();
    const customerName = `${order.customer?.firstName || ""} ${order.customer?.lastName || ""}`.toLowerCase();
    const shippingName = `${order.shippingAddress?.firstName || ""} ${order.shippingAddress?.lastName || ""}`.toLowerCase();
    const phone = String(order.customer?.phone || order.shippingAddress?.phone || "").toLowerCase();
    const tags = order.tags?.join(" ").toLowerCase() || "";

    return (
      orderName.includes(query) ||
      customerName.includes(query) ||
      shippingName.includes(query) ||
      phone.includes(query) ||
      tags.includes(query)
    );
  });

  const getMarginColor = (margin: number) => {
    if (margin >= 40) return "text-green-600 bg-green-50 border-green-200";
    if (margin >= 20) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const checkedCount = Object.keys(selectedUnfulfilled).filter(id => selectedUnfulfilled[id]).length;

  return (
    <div className="space-y-6">
      
      {/* Top Search & Actions Bar (Integrated on the top, taking minimal vertical space) */}
      <div className="flex justify-between items-center bg-white/40 border border-[#4A154B]/10 rounded-xl p-2.5 backdrop-blur-md">
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Search orders by name, number, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-[#4A154B]/10 bg-white text-xs outline-none focus:border-[#4A154B] focus:ring-1 focus:ring-[#4A154B]/10 transition-all font-semibold cursor-pointer"
          />
          <Search size={14} className="absolute left-3 top-2.5 text-[#1A1A1A]/40" />
        </div>
      </div>

      {/* Daily Logistics Pickup Coordinator Panel */}
      {unfulfilledOrders.length > 0 && (
        <div className="bg-white border border-[#4A154B]/10 rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#4A154B]/5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#4A154B]/5 text-[#4A154B]">
                <Truck size={18} className="text-[#D4AF37]" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-[#4A154B]">
                  Create Pickup
                </h4>
              </div>
            </div>
          
          {scheduledPickups.length > 0 && unfulfilledOrders.length > 0 && (
            <button
              onClick={() => setShowScheduler(!showScheduler)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-[#4A154B]/5 text-[#4A154B] hover:bg-[#4A154B]/10 transition-all cursor-pointer"
            >
              {showScheduler ? "Hide Scheduler" : "Schedule Another Pickup"}
            </button>
          )}
        </div>

        {/* Dynamic Section: Unfulfilled Orders Queue */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-[#4A154B] uppercase tracking-wider text-[10px]">
              Unfulfilled Orders awaiting Shipment & Pickup
            </span>
            {checkedCount > 0 && (
              <span className="text-[11px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                {checkedCount} Selected for Processing
              </span>
            )}
          </div>

          {unfulfilledOrders.length === 0 ? (
            <div className="p-5 text-center text-xs text-[#1A1A1A]/50 bg-[#FAF8F5] border border-dashed border-[#4A154B]/10 rounded-xl font-medium">
              🎉 All customer orders have been successfully manifested. No unfulfilled queue left.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Desktop view: Table list of unfulfilled */}
              <div className="hidden md:block overflow-hidden border border-[#4A154B]/10 rounded-xl">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#4A154B]/5 bg-[#FAF8F5] text-[10px] uppercase font-bold text-[#1A1A1A]/55">
                      <th className="py-2.5 px-4 w-12 text-center">Select</th>
                      <th className="py-2.5 px-4 w-28">Order</th>
                      <th className="py-2.5 px-4 w-44">Customer</th>
                      <th className="py-2.5 px-4">Parcel Specs (Required on Selection)</th>
                      <th className="py-2.5 px-4 w-52">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#4A154B]/5 bg-white font-semibold">
                    {unfulfilledOrders.map((o) => {
                      const isChecked = !!selectedUnfulfilled[o.id];
                      const dims = orderDimensions[o.id] || { weightGrams: "500", length: "30", width: "20", height: "5" };
                      const customerName = `${o.shippingAddress?.firstName || o.customer?.firstName || "Customer"} ${o.shippingAddress?.lastName || o.customer?.lastName || ""}`.trim();

                      return (
                        <tr key={o.id} className={`hover:bg-[#FAF8F5]/30 ${isChecked ? "bg-[#4A154B]/5" : ""}`}>
                          {/* Checkbox */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleUnfulfilled(o.id)}
                              className="w-4 h-4 rounded text-[#4A154B] focus:ring-[#4A154B]/20 border-[#4A154B]/10 cursor-pointer"
                            />
                          </td>
                          {/* Order ID */}
                          <td 
                            className="py-3 px-4 font-bold text-[#4A154B] hover:text-[#D4AF37] cursor-pointer transition-colors"
                            onClick={() => setSelectedOrder(o)}
                          >
                            {o.name}
                          </td>
                          {/* Customer */}
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-[#1A1A1A] font-semibold">{customerName}</p>
                              <p className="text-[11px] text-[#1A1A1A]/50 mt-0.5">{o.shippingAddress?.city || "N/A"}</p>
                            </div>
                          </td>
                          {/* Inputs: weight and dimensions */}
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap items-center gap-3">
                              {/* Weight */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-[#1A1A1A]/50">Weight:</span>
                                <input
                                  type="text"
                                  disabled={!isChecked}
                                  value={dims.weightGrams}
                                  onChange={(e) => handleDimensionChange(o.id, "weightGrams", e.target.value)}
                                  className="w-16 h-8 text-center rounded-lg border border-[#4A154B]/15 bg-white disabled:opacity-40 text-xs outline-none focus:border-[#4A154B] font-bold"
                                />
                                <span className="text-[11px] text-[#1A1A1A]/50 font-normal">g</span>
                              </div>
                              {/* Dimensions L x W x H */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-[#1A1A1A]/50">Size (L×W×H):</span>
                                <input
                                  type="text"
                                  disabled={!isChecked}
                                  value={dims.length}
                                  onChange={(e) => handleDimensionChange(o.id, "length", e.target.value)}
                                  className="w-10 h-8 text-center rounded-lg border border-[#4A154B]/15 bg-white disabled:opacity-40 text-xs outline-none focus:border-[#4A154B]"
                                />
                                <span className="text-[10px] text-[#1A1A1A]/40 font-normal">×</span>
                                <input
                                  type="text"
                                  disabled={!isChecked}
                                  value={dims.width}
                                  onChange={(e) => handleDimensionChange(o.id, "width", e.target.value)}
                                  className="w-10 h-8 text-center rounded-lg border border-[#4A154B]/15 bg-white disabled:opacity-40 text-xs outline-none focus:border-[#4A154B]"
                                />
                                <span className="text-[10px] text-[#1A1A1A]/40 font-normal">×</span>
                                <input
                                  type="text"
                                  disabled={!isChecked}
                                  value={dims.height}
                                  onChange={(e) => handleDimensionChange(o.id, "height", e.target.value)}
                                  className="w-10 h-8 text-center rounded-lg border border-[#4A154B]/15 bg-white disabled:opacity-40 text-xs outline-none focus:border-[#4A154B]"
                                />
                                <span className="text-[11px] text-[#1A1A1A]/50 font-normal">cm</span>
                              </div>
                            </div>
                          </td>
                          {/* Manual Fulfill column */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => setManualFulfillOrderId(manualFulfillOrderId === o.id ? null : o.id)}
                                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[#4A154B]/5 text-[#4A154B] hover:bg-[#4A154B]/10 cursor-pointer transition-all"
                              >
                                {manualFulfillOrderId === o.id ? "Cancel" : "Manual Fulfill"}
                              </button>
                              
                              {manualFulfillOrderId === o.id && (
                                <div className="mt-2 p-2.5 bg-[#FAF8F5] border border-[#4A154B]/10 rounded-lg space-y-2 text-[11px] font-semibold">
                                  <div>
                                    <label className="block text-[9px] uppercase font-bold text-[#4A154B]/60 mb-1">AWB Number</label>
                                    <input
                                      type="text"
                                      value={manualAwb}
                                      onChange={(e) => setManualAwb(e.target.value)}
                                      placeholder="Enter AWB"
                                      className="w-full h-8 px-2 rounded border border-[#4A154B]/15 bg-white text-xs outline-none focus:border-[#4A154B]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase font-bold text-[#4A154B]/60 mb-1">Courier Partner</label>
                                    <select
                                      value={manualCourier}
                                      onChange={(e) => setManualCourier(e.target.value)}
                                      className="w-full h-8 px-2 rounded border border-[#4A154B]/15 bg-white text-xs outline-none focus:border-[#4A154B] cursor-pointer"
                                    >
                                      <option value="">Select Partner</option>
                                      <option value="Delhivery">Delhivery</option>
                                      <option value="Shiprocket">Shiprocket</option>
                                      <option value="Bluedart">Bluedart</option>
                                      <option value="DTDC">DTDC</option>
                                      <option value="India Post">India Post</option>
                                      <option value="Professional Couriers">Professional Couriers</option>
                                      <option value="Ekart Logistics">Ekart Logistics</option>
                                      <option value="Shadowfax">Shadowfax</option>
                                      <option value="Xpressbees">Xpressbees</option>
                                      <option value="SafeExpress">SafeExpress</option>
                                      <option value="Trackon">Trackon</option>
                                      <option value="Anjani">Anjani</option>
                                      <option value="Shree Maruti Courier">Shree Maruti Courier</option>
                                    </select>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={!manualAwb || !manualCourier || manualFulfilling}
                                    onClick={() => handleManualFulfillSubmit(o.id)}
                                    className="w-full h-8 rounded bg-green-600 hover:bg-green-700 text-white font-bold uppercase text-[10px] tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                                  >
                                    {manualFulfilling ? "Fulfilling..." : "Mark Dispatched"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile view: Lite Card list of unfulfilled */}
              <div className="flex flex-col space-y-3 md:hidden">
                {unfulfilledOrders.map((o) => {
                  const isChecked = !!selectedUnfulfilled[o.id];
                  const dims = orderDimensions[o.id] || { weightGrams: "500", length: "30", width: "20", height: "5" };
                  const customerName = `${o.shippingAddress?.firstName || o.customer?.firstName || "Customer"} ${o.shippingAddress?.lastName || o.customer?.lastName || ""}`.trim();

                  return (
                    <div 
                      key={o.id} 
                      className={`p-4 rounded-xl border border-[#4A154B]/10 bg-white flex flex-col gap-3 transition-colors ${isChecked ? "ring-2 ring-[#4A154B] bg-[#4A154B]/5" : ""}`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleUnfulfilled(o.id)}
                            className="w-4 h-4 rounded text-[#4A154B] border-[#4A154B]/10 cursor-pointer"
                          />
                          <span 
                            className="font-bold text-[#4A154B] hover:text-[#D4AF37] cursor-pointer transition-colors"
                            onClick={() => setSelectedOrder(o)}
                          >
                            {o.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Awaiting Dispatch
                        </span>
                      </div>

                      <div className="text-xs">
                        <p className="font-semibold text-[#1A1A1A]">{customerName}</p>
                        <p className="text-[10px] text-[#1A1A1A]/50 mt-0.5">{o.shippingAddress?.city || "N/A"}</p>
                      </div>

                      {isChecked && (
                        <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#4A154B]/5 space-y-2.5">
                          <p className="text-[9px] uppercase font-bold text-[#4A154B]/60 tracking-wider">Configure Shipment Size</p>
                          <div className="flex justify-between items-center gap-2 text-xs">
                            <span className="text-[#1A1A1A]/60">Weight (g):</span>
                            <input
                              type="text"
                              value={dims.weightGrams}
                              onChange={(e) => handleDimensionChange(o.id, "weightGrams", e.target.value)}
                              className="w-16 h-8 text-center rounded border border-[#4A154B]/15 bg-white text-xs outline-none font-bold"
                            />
                          </div>
                          <div className="flex justify-between items-center gap-2 text-xs">
                            <span className="text-[#1A1A1A]/60">Size (L×W×H cm):</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={dims.length}
                                onChange={(e) => handleDimensionChange(o.id, "length", e.target.value)}
                                className="w-9 h-8 text-center rounded border border-[#4A154B]/15 bg-white text-xs outline-none"
                              />
                              <span className="text-[9px] text-[#1A1A1A]/30">×</span>
                              <input
                                type="text"
                                value={dims.width}
                                onChange={(e) => handleDimensionChange(o.id, "width", e.target.value)}
                                className="w-9 h-8 text-center rounded border border-[#4A154B]/15 bg-white text-xs outline-none"
                              />
                              <span className="text-[9px] text-[#1A1A1A]/30">×</span>
                              <input
                                type="text"
                                value={dims.height}
                                onChange={(e) => handleDimensionChange(o.id, "height", e.target.value)}
                                className="w-9 h-8 text-center rounded border border-[#4A154B]/15 bg-white text-xs outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="pt-2 border-t border-[#4A154B]/5 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setManualFulfillOrderId(manualFulfillOrderId === o.id ? null : o.id)}
                          className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[#4A154B]/5 text-[#4A154B] hover:bg-[#4A154B]/10 cursor-pointer transition-all"
                        >
                          {manualFulfillOrderId === o.id ? "Cancel Manual Fulfill" : "Manual Fulfill Shipment"}
                        </button>
                        
                        {manualFulfillOrderId === o.id && (
                          <div className="p-3 bg-[#FAF8F5] border border-[#4A154B]/10 rounded-lg space-y-2 text-[11px] font-semibold">
                            <div>
                              <label className="block text-[9px] uppercase font-bold text-[#4A154B]/60 mb-1">AWB Number</label>
                              <input
                                type="text"
                                value={manualAwb}
                                onChange={(e) => setManualAwb(e.target.value)}
                                placeholder="Enter tracking AWB"
                                className="w-full h-8 px-2 rounded border border-[#4A154B]/15 bg-white text-xs outline-none focus:border-[#4A154B]"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] uppercase font-bold text-[#4A154B]/60 mb-1">Courier Partner</label>
                              <select
                                value={manualCourier}
                                onChange={(e) => setManualCourier(e.target.value)}
                                className="w-full h-8 px-2 rounded border border-[#4A154B]/15 bg-white text-xs outline-none focus:border-[#4A154B] cursor-pointer"
                              >
                                <option value="">Select Partner</option>
                                <option value="Delhivery">Delhivery</option>
                                <option value="Shiprocket">Shiprocket</option>
                                <option value="Bluedart">Bluedart</option>
                                <option value="DTDC">DTDC</option>
                                <option value="India Post">India Post</option>
                                <option value="Professional Couriers">Professional Couriers</option>
                                <option value="Ekart Logistics">Ekart Logistics</option>
                                <option value="Shadowfax">Shadowfax</option>
                                <option value="Xpressbees">Xpressbees</option>
                                <option value="SafeExpress">SafeExpress</option>
                                <option value="Trackon">Trackon</option>
                                <option value="Anjani">Anjani</option>
                                <option value="Shree Maruti Courier">Shree Maruti Courier</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              disabled={!manualAwb || !manualCourier || manualFulfilling}
                              onClick={() => handleManualFulfillSubmit(o.id)}
                              className="w-full h-8 rounded bg-green-600 hover:bg-green-700 text-white font-bold uppercase text-[10px] tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                            >
                              {manualFulfilling ? "Fulfilling..." : "Mark Dispatched"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bulk Dispatch Scheduler Drawer/Options shown when 1+ checked */}
              {checkedCount > 0 && (
                <div className="p-4 bg-[#4A154B]/5 border border-[#4A154B]/15 rounded-xl space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <span className="text-[11px] font-bold text-[#4A154B]">
                      ⚡ Setup bulk pickup schedule for {checkedCount} parcel(s)
                    </span>
                    <span className="text-[10px] text-[#1A1A1A]/60 italic font-medium">
                      One button click registers Delhivery waybills and sets up the pickup
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] uppercase font-bold text-[#4A154B]/60 tracking-wider">
                        Pickup Date
                      </label>
                      <select
                        value={pickupDate}
                        onChange={(e) => {
                          const newDate = e.target.value;
                          setPickupDate(newDate);
                          const day = availableDays.find(d => d.date === newDate);
                          if (day && day.slots.length > 0) {
                            setPickupTime(day.slots[0].value);
                          }
                        }}
                        className="h-10 rounded-xl border border-[#4A154B]/10 px-3 bg-white text-sm outline-none focus:border-[#4A154B] font-semibold cursor-pointer"
                      >
                        {availableDays.filter(d => !scheduledPickups.some((sp: any) => sp.date === d.date)).map((d) => (
                          <option key={d.date} value={d.date}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] uppercase font-bold text-[#4A154B]/60 tracking-wider">
                        Time Slot
                      </label>
                      <select
                        value={pickupTime}
                        onChange={(e) => setPickupTime(e.target.value)}
                        className="h-10 rounded-xl border border-[#4A154B]/10 px-3 bg-white text-sm outline-none focus:border-[#4A154B] font-semibold cursor-pointer"
                      >
                        {currentSlots.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {pickupError && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-semibold">
                      ⚠️ {pickupError}
                    </div>
                  )}

                  {pickupSuccess && (
                    <div className="p-3 bg-green-50 text-green-700 rounded-xl border border-green-200 text-xs font-semibold">
                      ✅ {pickupSuccess}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleBulkManifestAndPickup}
                    disabled={scheduling || loadingSlots}
                    className="w-full h-11 rounded-xl text-xs font-bold uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Truck size={14} />
                    {scheduling ? "Processing Bulk Fulfillments..." : `Fulfill & Request Bulk Pickup (${checkedCount} orders)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Scheduled Pickups Status */}
        {scheduledPickups.filter((sp: any) => !inTransitPickups[sp.id]).length > 0 ? (
          <div className="space-y-2.5 border-t border-[#4A154B]/5 pt-4">
            <span className="text-[9px] uppercase font-bold text-[#4A154B]/55 tracking-wider block">
              Active scheduled pickups for the day
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {scheduledPickups.filter((sp: any) => !inTransitPickups[sp.id]).map((pickup) => (
                <div key={pickup.id} className="p-3 bg-green-50/70 border border-green-200/50 rounded-xl space-y-1 text-xs text-green-800">
                  <p className="font-bold flex items-center gap-1.5 text-green-700">
                    <CheckCircle2 size={13} />
                    Pickup ID: {pickup.id}
                  </p>
                  <p className="text-[10px] text-green-800/80">
                    Date/Slot: <strong className="text-green-900">{pickup.date}</strong> ({pickup.time === "10:00:00" ? "Morning Slot (10 AM - 1 PM)" : "Afternoon Slot (2 PM - 5 PM)"})
                  </p>
                  <p className="text-[10px] text-green-800/80">
                    Manifested Packages Linked: <strong className="text-green-900">{pickup.ordersCount} (
                      {pickup.orders.map((orderName: string, idx: number) => {
                        const matchedOrder = initialOrders.find(o => o.name === orderName);
                        return (
                          <span key={orderName}>
                            {idx > 0 && ", "}
                            {matchedOrder ? (
                              <button
                                type="button"
                                onClick={() => setSelectedOrder(matchedOrder)}
                                className="underline hover:text-green-700 font-bold focus:outline-none cursor-pointer inline bg-transparent border-none p-0 text-inherit"
                              >
                                {orderName}
                              </button>
                            ) : (
                              <span>{orderName}</span>
                            )}
                          </span>
                        );
                      })}
                    )</strong>
                  </p>
                  <div className="mt-2 p-1.5 bg-amber-50 text-amber-900 rounded-lg border border-amber-200 text-[10px] leading-relaxed">
                    📌 <strong>Pack before:</strong> {pickup.time === "10:00:00" ? "09:30 AM" : "01:30 PM"} on {pickup.date}.
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-green-200/40 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleCancelPickup(pickup.id, pickup.orders)}
                      disabled={cancellingPickupId === pickup.id}
                      className="px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:text-red-700 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {cancellingPickupId === pickup.id ? "Clearing..." : "Cancel / Clear Pickup"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Collapsible scheduler form drawer if there is an active pickup, but they want to schedule another one */}
        {scheduledPickups.length > 0 && showScheduler && (
          <div className="p-4 bg-[#FAF8F5] border border-[#4A154B]/5 rounded-xl space-y-4">
            <span className="text-[10px] uppercase font-bold text-[#4A154B]/60 tracking-wider block">
              Schedule Additional Pickup Run
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-[#4A154B]/60 tracking-wider">
                  Pickup Date (Delhivery Available)
                </label>
                <select
                  value={pickupDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setPickupDate(newDate);
                    const day = availableDays.find(d => d.date === newDate);
                    if (day && day.slots.length > 0) {
                      setPickupTime(day.slots[0].value);
                    }
                  }}
                  className="h-10 rounded-xl border border-[#4A154B]/10 px-3 bg-white text-sm outline-none focus:border-[#4A154B] font-semibold cursor-pointer"
                >
                  {availableDays.filter(d => !scheduledPickups.some((sp: any) => sp.date === d.date)).map((d) => (
                    <option key={d.date} value={d.date}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-[#4A154B]/60 tracking-wider">
                  Time Slot
                </label>
                <select
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="h-10 rounded-xl border border-[#4A154B]/10 px-3 bg-white text-sm outline-none focus:border-[#4A154B] font-semibold cursor-pointer"
                >
                  {currentSlots.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {pickupError && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">⚠️ {pickupError}</div>}
            {pickupSuccess && <div className="p-3 bg-green-50 text-green-700 rounded-xl text-xs font-semibold">✅ {pickupSuccess}</div>}
            <button
              type="button"
              onClick={handleScheduleDailyPickup}
              disabled={scheduling || loadingSlots || manifestedAwaitingPickup.length === 0}
              className="w-full h-10 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#4A154B] text-white shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Calendar size={14} />
              {scheduling ? "Raising Dispatch Request..." : "Request Daily Pickup"}
            </button>
          </div>
        )}


        </div>
      )}

      {/* Orders Grid Table */}
      <div className="bg-white rounded-3xl border border-[#4A154B]/10 overflow-hidden shadow-[0_10px_30px_rgba(74,21,75,0.03)] backdrop-blur-sm">
        {/* Desktop view table */}
        <div className="hidden md:block overflow-hidden">
          <table className="w-full text-left border-collapse table-fixed">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[#4A154B]/10 bg-gradient-to-r from-[#4A154B]/5 to-transparent text-xs uppercase font-bold text-[#4A154B]/80 tracking-wider">
                <th className="py-4 px-4">Order #</th>
                <th className="py-4 px-4">Order Date</th>
                <th className="py-4 px-4">Customer Name</th>
                <th className="py-4 px-4 text-center">Order Amount</th>
                <th className="py-4 px-4 text-center">Fulfillment Status</th>
                <th className="py-4 px-4 text-center">Tracking ID</th>
                <th className="py-4 px-4 text-center">ETA</th>
                <th className="py-4 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#4A154B]/5 text-sm">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#1A1A1A]/40 font-medium">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    No customer orders found matching your search.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <MainOrderTableRow
                    key={order.id}
                    order={order}
                    setSelectedOrder={setSelectedOrder}
                    inTransitPickups={inTransitPickups}
                    editingAwbOrderId={editingAwbOrderId}
                    setEditingAwbOrderId={setEditingAwbOrderId}
                    editingCourier={editingCourier}
                    setEditingCourier={setEditingCourier}
                    newAwbValue={newAwbValue}
                    setNewAwbValue={setNewAwbValue}
                    handleUpdateAwb={handleUpdateAwb}
                    updatingAwb={updatingAwb}
                    getOrderNetMargin={getOrderNetMargin}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View card list */}
        <div className="md:hidden flex flex-col gap-4 p-4 bg-[#FAF8F5]/30">
          {filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-[#1A1A1A]/40 font-medium bg-white rounded-2xl border border-[#4A154B]/5 px-4 shadow-sm">
              <Package size={36} className="mx-auto mb-3 opacity-30 text-[#4A154B]" />
              No customer orders found matching your search.
            </div>
          ) : (
            filteredOrders.map((order) => {
              const { totalRetail, marginPercent } = getOrderNetMargin(order);
              const isPaid = order.displayFinancialStatus === "PAID";
              const customerName = order.customer && (order.customer.firstName || order.customer.lastName)
                ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
                : order.shippingAddress && (order.shippingAddress.firstName || order.shippingAddress.lastName)
                ? `${order.shippingAddress.firstName || ""} ${order.shippingAddress.lastName || ""}`.trim()
                : "Customer";

              return (
                <div 
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="bg-white rounded-2xl border border-[#4A154B]/10 p-4 flex flex-col gap-3 shadow-[0_4px_20px_rgba(74,21,75,0.02)] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex justify-between items-center border-b border-[#4A154B]/5 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#4A154B] text-sm">{order.name}</span>
                    </div>
                    <span className="text-[10px] text-[#1A1A1A]/45 flex items-center gap-1 font-medium">
                      <Calendar size={10} />
                      {new Date(order.createdAt).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[9px] uppercase font-bold text-[#1A1A1A]/40 tracking-wider">Customer</p>
                      <p className="font-bold text-[#1A1A1A] mt-0.5 truncate">{customerName}</p>
                      {order.shippingAddress?.city && (
                        <p className="text-[10px] text-[#1A1A1A]/50 flex items-center gap-0.5 mt-1 font-medium">
                          <MapPin size={9} className="text-[#4A154B]/70" />
                          {order.shippingAddress.city}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase font-bold text-[#1A1A1A]/40 tracking-wider">Amount</p>
                      <p className="font-extrabold text-[#4A154B] mt-0.5">₹{totalRetail.toLocaleString("en-IN")}</p>
                      <span className={`inline-block text-[9px] font-extrabold uppercase rounded-full px-2 py-0.5 mt-1 ${
                        isPaid ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                      }`}>
                        {order.displayFinancialStatus}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-[#4A154B]/5 justify-between items-center">
                    <span className={`text-[9px] font-extrabold rounded-lg px-2 py-0.5 border ${getMarginColor(marginPercent)}`}>
                      +{Math.round(marginPercent)}% Margin
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      order.displayFulfillmentStatus === "FULFILLED" 
                        ? "bg-green-50 text-green-700 border-green-200" 
                        : "bg-yellow-50 text-yellow-700 border-yellow-200"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        order.displayFulfillmentStatus === "FULFILLED" ? "bg-green-500" : "bg-yellow-500"
                      }`} />
                      {order.displayFulfillmentStatus === "FULFILLED" ? "Shipped" : "Processing"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Dynamic Detailed Drawer Modal overlay */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          metaMap={metaMap}
          onClose={() => {
            setSelectedOrder(null);
            const params = new URLSearchParams(window.location.search);
            if (params.has("name") || params.has("id")) {
              window.history.replaceState({}, "", window.location.pathname);
            }
          }}
        />
      )}

    </div>
  );
}

// Inline lazy-loaded dynamic tracking status component
import { useEffect as reactUseEffect } from "react";
function OrderEtaCell({ awb, courier, isManualFulfillment }: { awb: string, courier?: string, isManualFulfillment?: boolean }) {
  const [edd, setEdd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  reactUseEffect(() => {
    let active = true;
    fetch(`/api/orders/track?awb=${encodeURIComponent(awb)}&courier=${encodeURIComponent(courier || "")}&isManual=${!!isManualFulfillment}`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.ok && data?.tracking?.status) {
          setEdd(data.tracking.edd);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [awb, courier, isManualFulfillment]);

  const formatEdd = (eddString: string | null) => {
    if (!eddString) return "-";
    let cleaned = eddString.replace(/(,\s*|\s+)(evening|morning|afternoon)/i, "").trim();
    const dateObj = new Date(cleaned);
    if (!isNaN(dateObj.getTime())) {
      const dayName = dateObj.toLocaleDateString("en-IN", { weekday: "short" });
      const dateText = dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      return `${dateText} (${dayName})`;
    }
    return eddString;
  };

  return (
    <td className="py-3.5 px-4 text-center">
      {loading ? <span className="text-xs text-[#1A1A1A]/40 animate-pulse">Fetching...</span>
      : !edd ? <span className="text-xs text-gray-400">-</span>
      : <span className="text-xs text-blue-700 font-semibold">{formatEdd(edd)}</span>}
    </td>
  );
}

function LogisticsStatusBadge({ awb, courier, isManualFulfillment, tdClassName }: { awb: string, courier?: string, isManualFulfillment?: boolean, tdClassName?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  reactUseEffect(() => {
    let active = true;
    fetch(`/api/orders/track?awb=${encodeURIComponent(awb)}&courier=${encodeURIComponent(courier || "")}&isManual=${!!isManualFulfillment}`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.ok && data?.tracking?.status) {
          setStatus(data.tracking.status);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [awb, courier]);

  const getBadgeStyle = (s: string) => {
    const norm = s.toLowerCase();
    if (norm.includes("deliv")) return "bg-green-50 text-green-700 border-green-200";
    if (norm.includes("transit") || norm.includes("out for") || norm.includes("shipped") || norm === "pickup" || norm.includes("picked")) return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-[#D4AF37]/10 text-[#4A154B] border-[#D4AF37]/30";
  };

  const getDisplayStatus = (s: string) => {
    const norm = s.toLowerCase();
    if (norm === "pickup" || norm === "in_transit" || norm === "in transit") return "In Transit";
    return s;
  };

  if (loading) return <span className="text-xs text-[#1A1A1A]/40 animate-pulse mt-1">Checking status...</span>;
  if (!status) return <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-sans mt-1">No tracking</span>;

  return (
    <span className={`inline-block text-xs font-bold uppercase rounded px-1.5 py-0.5 border mt-1 ${getBadgeStyle(status)}`}>
      {getDisplayStatus(status)}
    </span>
  );
}

function MainOrderTableRow({
  order,
  setSelectedOrder,
  inTransitPickups,
  editingAwbOrderId,
  setEditingAwbOrderId,
  editingCourier,
  setEditingCourier,
  newAwbValue,
  setNewAwbValue,
  handleUpdateAwb,
  updatingAwb,
  getOrderNetMargin
}: any) {
  const { totalRetail } = getOrderNetMargin(order);
  const isPaid = order.displayFinancialStatus === "PAID";
  
  const getOrderAwb = (order: any) => {
    const awbAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "awb" || attr.key.toLowerCase() === "trackingid"
    );
    if (awbAttr?.value) return awbAttr.value;

    const awbMatch = order.note?.match(/AWB:\s*([^\s,]+)/i);
    if (awbMatch) return awbMatch[1];
    return null;
  };

  const getOrderPickupDetails = (order: any) => {
    const pickupIdAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "pickup_id"
    );
    const pickupDateAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "pickup_date"
    );
    const pickupTimeAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "pickup_time"
    );

    if (pickupIdAttr?.value) {
      return {
        id: pickupIdAttr.value,
        date: pickupDateAttr?.value || "N/A",
        time: pickupTimeAttr?.value || "N/A"
      };
    }
    return null;
  };

  const getOrderCourierPartner = (order: any) => {
    const courierAttr = order.customAttributes?.find(
      (attr: any) => attr.key.toLowerCase() === "courier_partner"
    );
    if (courierAttr?.value) return courierAttr.value;

    const courierTag = order.tags?.find((tag: string) => tag.toLowerCase().startsWith("courier:"));
    if (courierTag) return courierTag.split(":")[1]?.trim();
    return "Delhivery";
  };

  const awb = getOrderAwb(order);
  const pickup = getOrderPickupDetails(order);
  const deliveryStatusAttr = order.customAttributes?.find((attr: any) => attr.key.toLowerCase() === "delivery_status");
  const deliveryStatus = deliveryStatusAttr?.value || (order.tags?.includes("delivery_status:delivered") ? "delivered" : "dispatched");
  const hasManualIndicators = order.customAttributes?.some((attr: any) => attr.key.toLowerCase() === "courier_partner") || order.tags?.some((t: string) => t.toLowerCase().startsWith("courier:"));
  const isManualFulfillment = !pickup && hasManualIndicators;
  const courier = getOrderCourierPartner(order);

  const [actionsOpen, setActionsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <tr 
      onClick={() => setSelectedOrder(order)}
      className="hover:bg-[#FAF8F5]/30 transition-colors cursor-pointer group relative"
    >
      <td className="py-3.5 px-4 font-bold text-[#4A154B] group-hover:text-[#D4AF37] transition-colors">
        {order.name}
      </td>
      <td className="py-3.5 px-4 text-[#1A1A1A]/60 font-semibold whitespace-nowrap">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {new Date(order.createdAt).toLocaleDateString("en-IN", {
            month: "short", day: "numeric", year: "numeric"
          })}
        </span>
      </td>
      <td className="py-3.5 px-4 font-semibold">
        <p className="text-[#1A1A1A]">
          {order.customer && (order.customer.firstName || order.customer.lastName)
            ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
            : order.shippingAddress && (order.shippingAddress.firstName || order.shippingAddress.lastName)
            ? `${order.shippingAddress.firstName || ""} ${order.shippingAddress.lastName || ""}`.trim()
            : "Customer"}
        </p>
      </td>
      <td className="py-3.5 px-4 text-center font-bold text-[#4A154B]">
        <p>₹{totalRetail.toLocaleString("en-IN")}</p>
      </td>
      <td className="py-3.5 px-4 text-center whitespace-nowrap">
        <div className="flex flex-col items-center gap-1">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
            order.displayFulfillmentStatus === "FULFILLED" 
              ? "bg-green-50 text-green-700 border-green-200" 
              : "bg-yellow-50 text-yellow-700 border-yellow-200"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              order.displayFulfillmentStatus === "FULFILLED" ? "bg-green-500" : "bg-yellow-500"
            }`} />
            {order.displayFulfillmentStatus === "FULFILLED" ? "Shipped" : "Processing"}
          </span>
          {awb && (
            <LogisticsStatusBadge awb={awb} courier={courier} isManualFulfillment={isManualFulfillment} />
          )}
        </div>
      </td>
      <td className="py-3.5 px-4 font-sans text-[#1A1A1A]/70 text-center relative" onClick={(e) => e.stopPropagation()}>
        {editingAwbOrderId === order.id ? (
          <div className="flex flex-col gap-1.5 bg-[#FAF8F5] p-2 rounded-lg border border-[#4A154B]/10 w-48 text-left absolute z-20 shadow-lg top-1/2 -translate-y-1/2 left-0">
            <div className="flex items-center justify-between text-[9px] uppercase font-bold text-[#4A154B]/60">
              <span>Courier & AWB</span>
            </div>
            <select
              value={editingCourier}
              onChange={(e) => setEditingCourier(e.target.value)}
              className="h-7 w-full px-1.5 border border-[#4A154B]/20 rounded text-[11px] outline-none bg-white font-sans cursor-pointer"
            >
              <option value="Delhivery">Delhivery</option>
              <option value="Shiprocket">Shiprocket</option>
              <option value="Bluedart">Bluedart</option>
              <option value="DTDC">DTDC</option>
            </select>
            <input
              type="text"
              value={newAwbValue}
              onChange={(e) => setNewAwbValue(e.target.value)}
              placeholder="Enter AWB"
              className="h-7 w-full px-1.5 border border-[#4A154B]/20 rounded text-xs outline-none bg-white font-sans"
            />
            <div className="flex gap-1.5 justify-end">
              <button
                type="button"
                disabled={updatingAwb || !newAwbValue.trim()}
                onClick={() => handleUpdateAwb(order.id, editingCourier)}
                className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
              >
                {updatingAwb ? "..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditingAwbOrderId(null)}
                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="font-semibold text-xs tracking-wide">{awb || <span className="italic text-gray-400">None</span>}</span>
            {deliveryStatus !== "delivered" && !pickup && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingAwbOrderId(order.id);
                  setNewAwbValue(awb || "");
                  setEditingCourier(courier);
                }}
                className="p-1 rounded-full bg-[#4A154B]/5 hover:bg-[#4A154B] text-[#4A154B] hover:text-white border border-[#4A154B]/15 hover:border-[#4A154B] transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-md cursor-pointer flex items-center justify-center"
                title="Edit AWB/Courier"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
        )}
      </td>
      {awb ? (
        <OrderEtaCell awb={awb} courier={courier} isManualFulfillment={isManualFulfillment} />
      ) : (
        <td className="py-3.5 px-4 text-center text-gray-400 text-xs">-</td>
      )}

      <td className="py-3.5 px-4 text-center relative" onClick={(e) => e.stopPropagation()}>
        <div ref={dropdownRef} className="relative inline-block">
          <button
            type="button"
            onClick={() => setActionsOpen(!actionsOpen)}
            className="p-1.5 rounded-lg bg-[#4A154B]/5 hover:bg-[#4A154B]/10 text-[#4A154B] transition-all flex items-center justify-center cursor-pointer"
          >
            <MoreVertical size={16} />
          </button>
          {actionsOpen && (
            <div className="absolute right-0 mt-1 w-40 bg-white border border-[#4A154B]/10 rounded-lg shadow-lg overflow-hidden z-20 text-left">
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  setSelectedOrder(order);
                }}
                className="w-full px-3 py-2 text-xs font-semibold text-[#1A1A1A] hover:bg-[#FAF8F5] text-left flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Eye size={12} /> View Order
              </button>
              {awb && !isManualFulfillment && (!pickup || !inTransitPickups[pickup?.id]) && (
                <a
                  href={`/api/orders/packing-slip?awb=${awb}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setActionsOpen(false)}
                  className="w-full px-3 py-2 text-xs font-semibold text-[#1A1A1A] hover:bg-[#FAF8F5] text-left flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Download size={12} /> Download Label
                </a>
              )}
              <a
                href={`/api/orders/receipt?orderId=${encodeURIComponent(order.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setActionsOpen(false)}
                className="w-full px-3 py-2 text-xs font-semibold text-[#1A1A1A] hover:bg-[#FAF8F5] text-left flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Receipt size={12} /> Download Receipt
              </a>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
