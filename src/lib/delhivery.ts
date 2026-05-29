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

export async function getTrackingByAwb(awbCode: string): Promise<NormalizedTracking | null> {
  const token = process.env.DELHIVERY_API_TOKEN || "";
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

  const { orderId, customerName, address, weightKg = 0.5, packageDesc } = input;

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
          weight: weightKg,
          cod_amount: 0,
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

