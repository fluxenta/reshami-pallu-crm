const DEV_BASE = "https://staging-express.delhivery.com";
const LIVE_BASE = "https://track.delhivery.com";
const FETCH_TIMEOUT_MS = 10_000;

export interface NormalizedTracking {
  status: string;
  edd: string;
  deliveredDate: string;
  activities: Array<{
    activity: string;
    location: string;
    date: string;
  }>;
}

export function getBaseUrl(): string {
  const mode = (process.env.DELHIVERY_MODE || "test").toLowerCase();
  return mode === "live" ? LIVE_BASE : DEV_BASE;
}

export async function getTrackingByAwb(awbCode: string, isManual: boolean = false): Promise<NormalizedTracking | null> {
  const token = process.env.DELHIVERY_API_TOKEN || "";
  
  if (isManual) {
    // Only use public unified API for manual fulfillments to bypass origin account restrictions
    try {
      const pubRes = await fetch(`https://dlv-api.delhivery.com/v3/unified-tracking-new?wbn=${awbCode}`, {
        method: "GET",
        headers: {
          "Origin": "https://www.delhivery.com",
          "Referer": "https://www.delhivery.com/"
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });

      if (pubRes.ok) {
        const pubData = await pubRes.json();
        if (pubData?.data && pubData.data.length > 0) {
          const item = pubData.data[0];
          const currentStatus = item.status?.status || item.hqStatus || "Manifested";
          const edd = item.deliveryDate || item.deliveryDateText_v1 || "";
          const deliveredDate = currentStatus.toLowerCase() === "delivered" ? item.status?.statusDateTime || "" : "";
          
          const activities: any[] = [];
          if (item.trackingStates && Array.isArray(item.trackingStates)) {
            item.trackingStates.forEach((state: any) => {
              if (state.scans && Array.isArray(state.scans)) {
                state.scans.forEach((scan: any) => {
                  activities.push({
                    activity: scan.scan || scan.scanNslRemark || "Parcel processed",
                    location: scan.scannedLocation || scan.cityLocation || "",
                    date: scan.scanDateTime || state.date || new Date().toISOString(),
                  });
                });
              }
            });
          }
          
          return {
            status: currentStatus,
            edd,
            deliveredDate,
            activities,
          };
        }
      }
    } catch (err) {
      console.error("Public Delhivery tracking fetch failed:", err);
    }
    return null; // Don't fallback to B2B API for manual orders as it will fail anyway
  }

  // Use authenticated B2B API for automated orders (created by us)
  if (!token) return null;
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/v1/packages/json/?waybill=${awbCode}&token=${token}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) return null;
    const response = await res.json();
    
    const shipmentDataList = response?.ShipmentData || [];
    if (shipmentDataList.length === 0) return null;

    const shipment = shipmentDataList[0]?.Shipment;
    if (!shipment) return null;

    const currentStatus = shipment.Status?.Status || "Manifested";
    const edd = shipment.ExpectedDeliveryDate || "";
    const deliveredDate = shipment.DeliveryDate || "";

    const rawScans = shipment.Scans || [];
    const activities = rawScans.map((scan: any) => {
      const detail = scan.ScanDetail;
      return {
        activity: detail?.Scan || detail?.Status || "Parcel processed",
        location: detail?.ScannedLocation || "",
        date: detail?.ScanDateTime || new Date().toISOString(),
      };
    });

    return {
      status: currentStatus,
      edd,
      deliveredDate,
      activities,
    };
  } catch (err) {
    console.error("Delhivery tracking fetch failed in CRM:", err);
    return null;
  }
}

export interface BookShipmentInput {
  orderId: string;
  customerName: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    mobile: string;
  };
  weightKg?: number;
  packageDesc?: string;
  length?: number;
  width?: number;
  height?: number;
  products?: Array<{
    name: string;
    qty: number;
    price: number;
    sku: string;
  }>;
  totalPrice?: number;
}

export interface BookingResult {
  success: boolean;
  awb?: string;
  status?: string;
  error?: string;
}

export async function bookShipmentWithDelhivery(
  input: BookShipmentInput
): Promise<BookingResult> {
  const token = process.env.DELHIVERY_API_TOKEN || "";
  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION || "RESHMI PALLU";
  if (!token) {
    return { success: false, error: "Delhivery API Token is not configured." };
  }

  const { 
    orderId, 
    customerName, 
    address, 
    weightKg = 0.5, 
    packageDesc, 
    length = 0, 
    width = 0, 
    height = 0,
    products = [],
    totalPrice = 0
  } = input;

  try {
    const shipmentData = {
      shipments: [
        {
          name: customerName,
          add: `${address.line1}${address.line2 ? `, ${address.line2}` : ""}`,
          pin: address.pincode,
          city: address.city,
          state: address.state,
          country: "India",
          phone: address.mobile,
          order: orderId,
          payment_mode: "Pre-paid",
          package_desc: packageDesc || "Premium Indian Saree & Ethnic Wear",
          package_type: "box",
          weight: Math.round(weightKg * 1000), // weight in grams
          cod_amount: 0,
          shipment_length: length > 0 ? length : undefined,
          shipment_width: width > 0 ? width : undefined,
          shipment_height: height > 0 ? height : undefined,
          client: "6d2d07-RESHMIPALLU-do",
          products: products.length > 0 ? products : undefined,
          declared_value: totalPrice > 0 ? totalPrice : undefined,
        },
      ],
      pickup_location: {
        name: pickupLocation,
      },
    };

    const baseUrl = getBaseUrl();
    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("data", JSON.stringify(shipmentData));

    const res = await fetch(`${baseUrl}/api/cmu/create.json`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Token ${token}`,
      },
      body: params.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Delhivery API returned status ${res.status}`);
    }

    const response = await res.json() as any;

    // Retrieve waybill from response
    const pkg = response?.packages?.[0] || response?.rm_packages?.[0];

    // Build a human-readable error from whatever Delhivery returns
    if (!pkg?.waybill || pkg?.status === "Fail") {
      const apiErrors: string[] = [];

      // Top-level errors array
      if (response?.errors?.length) apiErrors.push(response.errors.join(", "));

      // Per-package remarks (e.g. ER0005 suspicious consignee)
      if (pkg?.remarks?.length) {
        const errCode = pkg.err_code ? `[${pkg.err_code}] ` : "";
        apiErrors.push(`${errCode}${pkg.remarks.join("; ")}`);
      }

      // Top-level remark
      if (response?.rmk && !apiErrors.length) apiErrors.push(response.rmk);

      const errMsg = apiErrors.length
        ? apiErrors.join(" | ")
        : "Failed to generate waybill from Delhivery.";

      console.error("[Delhivery] Booking rejected:", errMsg, "\nFull response:", JSON.stringify(response));
      throw new Error(errMsg);
    }

    return {
      success: true,
      awb: pkg.waybill,
      status: pkg.status || "Manifested",
    };
  } catch (err: any) {
    console.error("Delhivery shipment booking failed:", err);
    return {
      success: false,
      error: err.message || "Shipment booking failed.",
    };
  }
}

export interface PickupInput {
  pickupDate: string;
  pickupTime: string;
  expectedCount?: number;
}

export interface PickupResult {
  success: boolean;
  pickupId?: string;
  pickupDate?: string;
  pickupTime?: string;
  status?: string;
  error?: string;
}

export async function schedulePickupWithDelhivery(
  input: PickupInput
): Promise<PickupResult> {
  const token = process.env.DELHIVERY_API_TOKEN || "";
  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION || "RESHMI PALLU";
  if (!token) {
    return { success: false, error: "Delhivery API Token is not configured." };
  }

  const { pickupDate, pickupTime, expectedCount = 1 } = input;

  try {
    const payload = {
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      pickup_location: pickupLocation,
      expected_package_count: expectedCount,
    };

    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/fm/request/new/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[Delhivery Pickup Request Failed]:", res.status, text);
      throw new Error(`Delhivery API returned status ${res.status}: ${text}`);
    }

    const response = await res.json() as any;

    if (response?.error || response?.status === "Fail") {
      const errMsg = typeof response.error === "object"
        ? JSON.stringify(response.error)
        : (response.error || response.rmk || "Failed to schedule pickup.");
      throw new Error(errMsg);
    }

    return {
      success: true,
      pickupId: response?.pickup_id || response?.id || "N/A",
      pickupDate: response?.pickup_date || pickupDate,
      pickupTime: response?.pickup_time || pickupTime,
      status: response?.status || "Success",
    };
  } catch (err: any) {
    console.error("Delhivery pickup scheduling failed:", err);
    return {
      success: false,
      error: err.message || "Pickup scheduling failed.",
    };
  }
}

export async function getDelhiveryCharges(
  pincode: string,
  weightKg: number = 0.5,
  length?: number,
  width?: number,
  height?: number
): Promise<number> {
  const token = process.env.DELHIVERY_API_TOKEN || "";
  const pickupPincode = process.env.DELHIVERY_PICKUP_PINCODE || "560094";
  if (!token) return 0;

  try {
    const weightGrams = Math.round(weightKg * 1000);
    const baseUrl = getBaseUrl();
    const params = new URLSearchParams({
      md: "S",
      cgm: String(weightGrams),
      o_pin: String(pickupPincode),
      d_pin: pincode,
      ss: "Delivered",
    });

    const res = await fetch(`${baseUrl}/api/kinko/v1/invoice/charges/.json?${params.toString()}`, {
      headers: {
        Authorization: `Token ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json() as any;
      const chargeObj = Array.isArray(data) ? data[0] : data;
      if (chargeObj && typeof chargeObj.total_amount === "number") {
        return Math.round(chargeObj.total_amount);
      }
    }
  } catch (err) {
    console.error("Failed to fetch Delhivery charges in CRM:", err);
  }
  return 0;
}

