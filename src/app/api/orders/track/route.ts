import { NextRequest, NextResponse } from "next/server";
import { getTrackingByAwb as getDelhiveryTracking } from "@/lib/delhivery";
import { getShiprocketTracking } from "@/lib/shiprocket";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const awb = searchParams.get("awb") || "";
    const courier = (searchParams.get("courier") || "").toLowerCase().trim();

    if (!awb) {
      return NextResponse.json({ error: "AWB code is required" }, { status: 400 });
    }

    let tracking = null;

    if (courier === "shiprocket") {
      tracking = await getShiprocketTracking(awb);
    } else if (courier === "delhivery") {
      tracking = await getDelhiveryTracking(awb);
    } else {
      // Automatic fallback lookup
      tracking = await getDelhiveryTracking(awb);
      if (!tracking) {
        tracking = await getShiprocketTracking(awb);
      }
    }

    if (!tracking) {
      // Return a graceful fallback instead of failing with 404
      return NextResponse.json({
        ok: true,
        tracking: {
          status: "Awaiting Courier Update",
          edd: "",
          deliveredDate: "",
          activities: [
            {
              activity: "AWB generated. Package is awaiting pickup or courier scan.",
              location: "",
              date: new Date().toISOString()
            }
          ]
        }
      });
    }

    return NextResponse.json({ ok: true, tracking });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch tracking" }, { status: 500 });
  }
}
