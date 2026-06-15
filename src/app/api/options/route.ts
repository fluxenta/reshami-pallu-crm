import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const revalidate = 0; // Disable server cache

export async function GET() {
  try {
    const [fabrics, weaves, occasions, colorFamilies] = await Promise.all([
      db.smembers("options:fabrics"),
      db.smembers("options:weaves"),
      db.smembers("options:occasions"),
      db.smembers("options:colorFamilies"),
    ]);

    return NextResponse.json({
      fabrics: fabrics || [],
      weaves: weaves || [],
      occasions: occasions || [],
      colorFamilies: colorFamilies || [],
    });
  } catch (err: any) {
    console.error("Failed to fetch custom options from Redis:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { type, value } = await req.json();

    if (!type || !value || !value.trim()) {
      return NextResponse.json({ error: "Missing type or value" }, { status: 400 });
    }

    const validTypes = ["fabrics", "weaves", "occasions", "colorFamilies"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid option type" }, { status: 400 });
    }

    const key = `options:${type}`;
    await db.sadd(key, value.trim());

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to save custom option to Redis:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
