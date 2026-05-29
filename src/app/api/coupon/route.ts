// src/app/api/coupon/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: Retrieve all dynamic coupons
export async function GET() {
  try {
    const data = await db.get("site:coupons");
    const coupons = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    return NextResponse.json({ coupons: Array.isArray(coupons) ? coupons : [] });
  } catch (err: any) {
    console.error("Failed to fetch coupons from Redis:", err);
    return NextResponse.json({ coupons: [], error: err.message }, { status: 500 });
  }
}

// POST: Save, Update, Toggle status, or Delete a coupon in the coupons list
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, code, discountPercent, minPurchase, isActive } = body;

    const data = await db.get("site:coupons");
    let coupons = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    if (!Array.isArray(coupons)) {
      coupons = [];
    }

    const normalizedCode = code ? code.trim().toUpperCase() : "";

    if (action === "delete") {
      if (!normalizedCode) {
        return NextResponse.json({ error: "Code is required for deletion." }, { status: 400 });
      }
      coupons = coupons.filter((c: any) => c.code !== normalizedCode);
      await db.set("site:coupons", coupons);
      return NextResponse.json({ success: true, coupons });
    }

    if (action === "toggle") {
      if (!normalizedCode) {
        return NextResponse.json({ error: "Code is required for toggle." }, { status: 400 });
      }
      coupons = coupons.map((c: any) => {
        if (c.code === normalizedCode) {
          return { ...c, isActive: !c.isActive, updatedAt: new Date().toISOString() };
        }
        return c;
      });
      await db.set("site:coupons", coupons);
      return NextResponse.json({ success: true, coupons });
    }

    // Add or Update Coupon
    if (!normalizedCode || !discountPercent) {
      return NextResponse.json({ error: "Coupon code and discount percentage are required." }, { status: 400 });
    }

    const newCoupon = {
      code: normalizedCode,
      discountPercent: Number(discountPercent),
      minPurchase: Number(minPurchase || 0),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = coupons.findIndex((c: any) => c.code === normalizedCode);
    if (existingIndex > -1) {
      coupons[existingIndex] = newCoupon;
    } else {
      coupons.push(newCoupon);
    }

    await db.set("site:coupons", coupons);
    return NextResponse.json({ success: true, coupons, coupon: newCoupon });
  } catch (err: any) {
    console.error("Failed to save coupon in Redis:", err);
    return NextResponse.json({ error: err.message || "Failed to save coupon" }, { status: 500 });
  }
}
