import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";

async function verifySession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("crm_session");
  return session && session.value === "authenticated";
}

export async function GET(req: NextRequest) {
  try {
    if (!await verifySession()) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const csvPath = path.resolve(process.cwd(), "data/inventory_cleaned.csv");
    if (!fs.existsSync(csvPath)) {
      return new NextResponse("Cleaned CSV file not found. Please clean the CSV first.", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(csvPath);
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=inventory_cleaned.csv",
      },
    });
  } catch (err: any) {
    return new NextResponse(err.message || "Failed to download CSV", { status: 500 });
  }
}
