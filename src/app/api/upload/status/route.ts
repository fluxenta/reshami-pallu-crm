import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { processQueueAsync } from "@/lib/media-worker";

export const revalidate = 0; // Dynamic route

export async function GET(req: NextRequest) {
  try {
    // 1. Session verification
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Media ID is required" }, { status: 400 });
    }

    const itemStr = await db.hget<any>("media:queue", id);
    if (!itemStr) {
      return NextResponse.json({ error: "Media item not found in queue" }, { status: 404 });
    }

    const item = typeof itemStr === "string" ? JSON.parse(itemStr) : itemStr;

    // Vercel Serverless Safeguard: If the worker thread got frozen/stopped, 
    // we trigger the non-blocking processQueueAsync during active browser polling.
    if (item.status === "queued") {
      console.log(`[Upload Status API] Item ${id} is queued. Invoking worker to run within active request context...`);
      processQueueAsync();
    }
    return NextResponse.json({
      id: item.id,
      status: item.status,
      type: item.type,
      shopifyId: item.shopifyId || null,
      shopifyUrl: item.shopifyUrl || null,
      error: item.error || null,
    });
  } catch (err: any) {
    console.error("API upload status error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch status" }, { status: 500 });
  }
}
