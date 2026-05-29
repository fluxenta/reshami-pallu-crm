import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const revalidate = 0; // Dynamic route

export async function GET(req: NextRequest) {
  try {
    // 1. Session verification
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const heroImage = await db.get<string>("brand:hero:image") || "/images/hero-reshami-pallu.png";
    const heroTitle = await db.get<string>("brand:hero:title") || "BORN TO DAZZLE";
    const heroSubtitle = await db.get<string>("brand:hero:subtitle") || "CRAFTED TO STAND OUT—JUST LIKE YOU.";
    const loginImage = await db.get<string>("brand:login:image") || "/images/hero-reshami-pallu.png";

    return NextResponse.json({ heroImage, heroTitle, heroSubtitle, loginImage });
  } catch (err: any) {
    console.error("Failed to fetch brand customizer settings:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Session verification
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const body = await req.json();
    const { heroImage, heroTitle, heroSubtitle, loginImage } = body;

    if (heroImage !== undefined) await db.set("brand:hero:image", heroImage || "");
    if (heroTitle !== undefined) await db.set("brand:hero:title", heroTitle || "");
    if (heroSubtitle !== undefined) await db.set("brand:hero:subtitle", heroSubtitle || "");
    if (loginImage !== undefined) await db.set("brand:login:image", loginImage || "");

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to save brand customizer settings:", err);
    return NextResponse.json({ error: err.message || "Failed to save settings" }, { status: 500 });
  }
}
