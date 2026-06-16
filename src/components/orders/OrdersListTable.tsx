"use client";

import { useState, useEffect } from "react";
import { 
  Search, 
  Eye, 
  Calendar, 
  MapPin, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  Package,
  Receipt,
  Truck
} from "lucide-react";
import OrderDetailModal from "./OrderDetailModal";

interface OrdersListTableProps {
  initialOrders: any[];
  metaMap: Record<string, { costPrice: number; margin: number; privateNotes?: string }>;
}

export default function OrdersListTable({ initialOrders, metaMap }: OrdersListTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // Daily Pickup states
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [pickupSuccess, setPickupSuccess] = useState<string | null>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [mappingOrderId, setMappingOrderId] = useState<string | null>(null);

  const [availableDays, setAvailableDays] = useState<Array<{ date: string, label: string, slots: Array<{ value: string, label: string }> }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);

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

  // Compute order details locally to display profit margins in the main table list
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

  // Filter orders by search input (matching order name, customer name, phone, or tags)
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

  // 1. Calculate manifested shipments awaiting pickup
  const manifestedAwaitingPickup = initialOrders.filter((order) => {
    const awb = getOrderAwb(order);
    const pickup = getOrderPickupDetails(order);
    const hasPickup = !!pickup || order.tags?.includes("Pickup Scheduled");
    return !!awb && !hasPickup;
  });

  // 2. Aggregate active scheduled pickups across orders
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

  const manifestedOrders = initialOrders.filter((order) => !!getOrderAwb(order));

  // 3. Handler to call bulk pickup request API
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
    // Find matching order objects to get their Shopify GIDs
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

  return (
    <div className="space-y-6">
      
      {/* Top Title Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/40 border border-[#4A154B]/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
        <div>
          <h3 className="font-display font-bold text-base sm:text-lg text-[#4A154B] flex items-center gap-2">
            <Receipt size={18} className="text-[#D4AF37]" />
            Live Customer Orders
          </h3>
          <p className="text-[11px] text-[#1A1A1A]/60 mt-0.5">
            Audit customer payments, dynamic delivery states, and weaver profit margins.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search by Order #, Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-[#4A154B]/10 bg-white text-xs outline-none focus:border-[#4A154B] focus:ring-1 focus:ring-[#4A154B]/10 transition-all font-semibold"
          />
          <Search size={14} className="absolute left-3 top-3 text-[#1A1A1A]/40" />
        </div>
      </div>

      {/* Daily Logistics Pickup Coordinator Panel */}
      <div className="bg-white border border-[#4A154B]/10 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#4A154B]/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#4A154B]/5 text-[#4A154B]">
              <Truck size={18} className="text-[#D4AF37]" />
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-[#4A154B]">
                Daily Logistics Pickup Coordinator
              </h4>
              <p className="text-[11px] text-[#1A1A1A]/55">
                Manage daily Delhivery pickups and map manifested packages to scheduled pickup runs.
              </p>
            </div>
          </div>
          
          {scheduledPickups.length > 0 && (
            <button
              onClick={() => setShowScheduler(!showScheduler)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-[#4A154B]/5 text-[#4A154B] hover:bg-[#4A154B]/10 transition-all cursor-pointer"
            >
              {showScheduler ? "Hide Scheduler" : "Schedule Another Pickup"}
            </button>
          )}
        </div>

        {/* Warning Alert if there are unscheduled manifested orders while a pickup is active */}
        {scheduledPickups.length > 0 && manifestedAwaitingPickup.length > 0 && (
          <div className="p-3.5 bg-amber-50 border border-amber-200/70 rounded-xl space-y-2 text-xs text-amber-900">
            <p className="font-bold flex items-center gap-1.5 text-amber-800">
              ⚠️ {manifestedAwaitingPickup.length} New Manifested Package(s) Awaiting Pickup
            </p>
            <p className="text-[10px] text-amber-800/80 leading-relaxed font-semibold">
              Delhivery does not allow adding new packages to an already scheduled pickup ID. You must either cancel the current pickup request to schedule a fresh one for all packages, or schedule a separate run (e.g. next day slot).
            </p>
            <div className="flex gap-2 pt-1 font-bold">
              <button
                type="button"
                onClick={() => {
                  const sp = scheduledPickups[0];
                  if (sp) {
                    handleCancelPickup(sp.id, sp.orders);
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg text-[9px] uppercase bg-amber-600 hover:bg-amber-700 text-white transition-all cursor-pointer shadow-sm"
              >
                Cancel Current & Reschedule All
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowScheduler(true);
                  if (availableDays.length > 1) {
                    setPickupDate(availableDays[1].date);
                    if (availableDays[1].slots.length > 0) {
                      setPickupTime(availableDays[1].slots[0].value);
                    }
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg text-[9px] uppercase bg-[#4A154B] hover:bg-[#4A154B]/90 text-white transition-all cursor-pointer shadow-sm"
              >
                Schedule Next Day / Separate Run
              </button>
            </div>
          </div>
        )}

        {/* Scheduled Pickups Status */}
        {scheduledPickups.length > 0 ? (
          <div className="space-y-2.5">
            <span className="text-[9px] uppercase font-bold text-[#4A154B]/55 tracking-wider block">
              Active scheduled pickups for the day
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {scheduledPickups.map((pickup) => (
                <div key={pickup.id} className="p-3 bg-green-50/70 border border-green-200/50 rounded-xl space-y-1 text-xs text-green-800">
                  <p className="font-bold flex items-center gap-1.5 text-green-700">
                    <CheckCircle2 size={13} />
                    Pickup ID: {pickup.id}
                  </p>
                  <p className="text-[10px] text-green-800/80">
                    Date/Slot: <strong className="text-green-900">{pickup.date}</strong> ({pickup.time === "10:00:00" ? "Morning Slot (10 AM - 1 PM)" : "Afternoon Slot (2 PM - 5 PM)"})
                  </p>
                  <p className="text-[10px] text-green-800/80">
                    Manifested Packages Linked: <strong className="text-green-900">{pickup.ordersCount} ({pickup.orders.join(", ")})</strong>
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
        ) : (
          /* Show scheduler directly if no pickup is scheduled */
          <div className="p-4 bg-[#FAF8F5] border border-[#4A154B]/5 rounded-xl space-y-4">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-[#4A154B]">
                No Daily Pickup Scheduled yet.
              </span>
              {manifestedAwaitingPickup.length > 0 && (
                <span className="text-[10px] text-[#1A1A1A]/60 italic font-medium">
                  {manifestedAwaitingPickup.length} manifested shipments awaiting pickup ({manifestedAwaitingPickup.map(o => o.name).join(", ")})
                </span>
              )}
            </div>

            {manifestedAwaitingPickup.length === 0 ? (
              <div className="p-3.5 text-center text-xs text-[#1A1A1A]/50 bg-white border border-dashed border-[#4A154B]/10 rounded-xl font-medium leading-relaxed">
                🎉 No manifested shipments are currently awaiting pickup. All orders are either dispatched or unscheduled.
              </div>
            ) : (
              <div className="space-y-4">
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
                      className="h-10 rounded-xl border border-[#4A154B]/10 px-3 bg-white text-xs outline-none focus:border-[#4A154B] font-semibold"
                    >
                      {availableDays.map((d) => (
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
                      className="h-10 rounded-xl border border-[#4A154B]/10 px-3 bg-white text-xs outline-none focus:border-[#4A154B] font-semibold"
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
                  onClick={handleScheduleDailyPickup}
                  disabled={scheduling || loadingSlots}
                  className="w-full h-10 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#4A154B] text-white shadow-md shadow-[#4A154B]/10 hover:opacity-90 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Calendar size={14} />
                  {scheduling ? "Raising Dispatch Request..." : "Request Daily Pickup"}
                </button>
              </div>
            )}
          </div>
        )}

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
                  className="h-10 rounded-xl border border-[#4A154B]/10 px-3 bg-white text-xs outline-none focus:border-[#4A154B] font-semibold"
                >
                  {availableDays.map((d) => (
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
                  className="h-10 rounded-xl border border-[#4A154B]/10 px-3 bg-white text-xs outline-none focus:border-[#4A154B] font-semibold"
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

        {/* Manifested Orders Queue / Mapping */}
        {manifestedOrders.length > 0 && (
          <div className="border-t border-[#4A154B]/5 pt-4">
            <span className="text-[10px] uppercase font-bold text-[#4A154B]/70 tracking-wider block mb-2">
              Manifested Orders Queue ({manifestedOrders.length})
            </span>
            <div className="overflow-x-auto max-h-60 overflow-y-auto border border-[#4A154B]/10 rounded-xl">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-[#4A154B]/5 bg-[#FAF8F5] text-[9px] uppercase font-bold text-[#1A1A1A]/55">
                    <th className="py-2 px-3">Order</th>
                    <th className="py-2 px-3">AWB / Tracking ID</th>
                    <th className="py-2 px-3">Pickup Status</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#4A154B]/5 bg-white font-semibold">
                  {manifestedOrders.map((order) => {
                    const awb = getOrderAwb(order);
                    const pickup = getOrderPickupDetails(order);

                    return (
                      <tr key={order.id} className="hover:bg-[#FAF8F5]/30">
                        <td className="py-2.5 px-3 font-bold text-[#4A154B]">{order.name}</td>
                        <td className="py-2.5 px-3 font-mono text-[#1A1A1A]/70">{awb}</td>
                        <td className="py-2.5 px-3">
                          {pickup ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] border border-green-200">
                              <CheckCircle2 size={10} />
                              Scheduled (ID: {pickup.id})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] border border-amber-200">
                              <Clock size={10} />
                              Awaiting Pickup
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {!pickup ? (
                            <span className="text-[10px] text-amber-700 font-semibold italic">Awaiting scheduling</span>
                          ) : (
                            <span className="text-[10px] text-green-700 font-semibold">Assigned to pickup {pickup.id}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Orders Grid Table */}
      <div className="ui-card overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#4A154B]/5 bg-[#FAF8F5]/50 text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">
                <th className="py-4 px-6">Order</th>
                <th className="py-4 px-6">Date</th>
                <th className="py-4 px-6">Customer</th>
                <th className="py-4 px-6 text-right">Revenue</th>
                <th className="py-4 px-6 text-center">Net Margin</th>
                <th className="py-4 px-6 text-center">Fulfillment</th>
                <th className="py-4 px-6 text-center">Carrier</th>
                <th className="py-4 px-6 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#4A154B]/5 text-xs">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#1A1A1A]/40 font-medium">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    No customer orders found matching your search.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const { totalRetail, marginPercent } = getOrderNetMargin(order);
                  const isPaid = order.displayFinancialStatus === "PAID";
                  
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-[#FAF8F5]/30 transition-colors cursor-pointer group"
                    >
                      {/* Order name */}
                      <td className="py-4 px-6 font-bold text-[#4A154B] group-hover:text-[#D4AF37] transition-colors">
                        {order.name}
                      </td>
                      
                      {/* Date */}
                      <td className="py-4 px-6 text-[#1A1A1A]/60 font-semibold whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(order.createdAt).toLocaleDateString("en-IN", {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          })}
                        </span>
                      </td>

                      {/* Customer Profile */}
                      <td className="py-4 px-6 font-semibold">
                        <div>
                          <p className="text-[#1A1A1A]">
                            {order.customer && (order.customer.firstName || order.customer.lastName)
                              ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
                              : order.shippingAddress && (order.shippingAddress.firstName || order.shippingAddress.lastName)
                              ? `${order.shippingAddress.firstName || ""} ${order.shippingAddress.lastName || ""}`.trim()
                              : "Customer"}
                          </p>
                          {order.shippingAddress?.city && (
                            <p className="text-[10px] text-[#1A1A1A]/40 flex items-center gap-0.5 mt-0.5">
                              <MapPin size={10} />
                              {order.shippingAddress.city}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Retail revenue */}
                      <td className="py-4 px-6 text-right font-display font-bold text-[#4A154B]">
                        <div>
                          <p>₹{totalRetail.toLocaleString("en-IN")}</p>
                          <span className={`inline-block text-[8px] font-bold uppercase rounded px-1 mt-0.5 ${
                            isPaid ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                          }`}>
                            {order.displayFinancialStatus}
                          </span>
                        </div>
                      </td>

                      {/* Calculated private net margins */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <span className={`inline-block text-[10px] font-bold rounded-lg px-2.5 py-0.5 border ${getMarginColor(marginPercent)}`}>
                          +{Math.round(marginPercent)}% Margin
                        </span>
                      </td>

                      {/* Fulfillment/Delhivery */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            order.displayFulfillmentStatus === "FULFILLED" 
                              ? "bg-green-50 text-green-700 border-green-200" 
                              : "bg-yellow-50 text-yellow-700 border-yellow-200"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              order.displayFulfillmentStatus === "FULFILLED" ? "bg-green-500" : "bg-yellow-500"
                            }`} />
                            {order.displayFulfillmentStatus === "FULFILLED" ? "Shipped" : "Processing"}
                          </span>

                          {(() => {
                            // Extract AWB
                            const awbAttribute = order.customAttributes?.find(
                              (attr: any) => attr.key.toLowerCase() === "awb" || attr.key.toLowerCase() === "trackingid"
                            );
                            let inlineAwb = awbAttribute ? awbAttribute.value : null;
                            if (!inlineAwb && order.note) {
                              const awbMatch = order.note.match(/AWB:\s*([^\s,]+)/i);
                              if (awbMatch) inlineAwb = awbMatch[1];
                            }

                            if (inlineAwb) {
                              return <LogisticsStatusBadge awb={inlineAwb} />;
                            }
                            return null;
                          })()}
                        </div>
                      </td>

                      {/* Carrier chosen by customer */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        {(() => {
                          const courierTag = order.tags?.find((tag: string) => tag.toLowerCase().startsWith("courier:"));
                          const courierName = courierTag && courierTag.split(":")[1]?.trim() !== "Shiprocket" ? courierTag.split(":")[1]?.trim() : "Delhivery";
                          return (
                            <span className="inline-block text-[10px] font-bold rounded-lg px-2.5 py-0.5 border text-purple-700 bg-purple-50 border-purple-200">
                              {courierName}
                            </span>
                          );
                        })()}
                      </td>

                      {/* View Action */}
                      <td className="py-4 px-6 text-center">
                        <button
                          type="button"
                          className="p-1.5 rounded-lg bg-[#4A154B]/5 hover:bg-[#4A154B]/10 text-[#4A154B] transition-all flex items-center justify-center mx-auto cursor-pointer"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dynamic Detailed Drawer Modal overlay */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          metaMap={metaMap}
          onClose={() => setSelectedOrder(null)}
        />
      )}

    </div>
  );
}

// Inline lazy-loaded dynamic tracking status component
import { useEffect as reactUseEffect } from "react";
function LogisticsStatusBadge({ awb }: { awb: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  reactUseEffect(() => {
    let active = true;
    fetch(`/api/orders/track?awb=${encodeURIComponent(awb)}`)
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
  }, [awb]);

  if (loading) {
    return <span className="text-[9px] text-[#1A1A1A]/40 animate-pulse">Checking status...</span>;
  }

  if (!status) {
    return <span className="text-[9px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-mono">No tracking</span>;
  }

  // Curated status styling matching modern design
  const getBadgeStyle = (s: string) => {
    const norm = s.toLowerCase();
    if (norm.includes("deliv")) return "bg-green-50 text-green-700 border-green-200";
    if (norm.includes("transit") || norm.includes("out for")) return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-[#D4AF37]/10 text-[#4A154B] border-[#D4AF37]/30";
  };

  return (
    <span className={`inline-block text-[9px] font-bold uppercase rounded px-1.5 py-0.5 border ${getBadgeStyle(status)}`}>
      {status}
    </span>
  );
}
