import { NextRequest, NextResponse } from "next/server";
import { getTrackingByAwb as getDelhiveryTracking } from "@/lib/delhivery";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const awb = searchParams.get("awb") || "";

    if (!awb) {
      return NextResponse.json({ error: "AWB code is required" }, { status: 400 });
    }

    // 1. Try Delhivery tracking first
    const tracking = await getDelhiveryTracking(awb);

    if (!tracking) {
      return NextResponse.json({ error: "Tracking data not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, tracking });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch tracking" }, { status: 500 });
  }
}
