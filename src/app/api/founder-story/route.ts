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

    const defaultText = `Reshmi Pallu was born out of a deep reverence for the timeless legacy of Indian handloom weaving. Growing up amidst the rich textile heritage of Varanasi, our founder Mrinalini Singh witnessed firsthand the incredible precision, patience, and poetry woven into every single saree by local master craftsmen.

Each saree we design at Reshmi Pallu tells a distinct tale—from the selection of the finest pure Banarasi mulberry silks and organic dyes, to the meticulously planned zari motifs that dance across the borders. Our ethos rests on three absolute pillars: preserving the raw authenticity of handloom craftsmanship, advocating fair wages and support for weaving communities, and delivering an unmatched, weightless drape experience to modern women who carry tradition in their hearts.

We don't just sell sarees; we share a piece of history, an heirloom to be passed down through generations. Thank you for being a part of our beautiful journey and preserving this priceless heritage with us.`;

    const text = await db.get<string>("founder:story:text") || defaultText;
    const image = await db.get<string>("founder:story:image") || "";

    return NextResponse.json({ text, image });
  } catch (err: any) {
    console.error("Failed to fetch founder story:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch story" }, { status: 500 });
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
    const { text, image } = body;

    await db.set("founder:story:text", text || "");
    await db.set("founder:story:image", image || "");

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to save founder story:", err);
    return NextResponse.json({ error: err.message || "Failed to save story" }, { status: 500 });
  }
}
