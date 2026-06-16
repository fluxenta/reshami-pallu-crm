import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/delhivery";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const awb = searchParams.get("awb");
    if (!awb) {
      return NextResponse.json({ error: "Missing AWB number" }, { status: 400 });
    }

    const token = process.env.DELHIVERY_API_TOKEN || "";
    if (!token) {
      return NextResponse.json({ error: "Delhivery API Token is not configured" }, { status: 500 });
    }

    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/api/p/packing_slip?wbns=${awb}&pdf=true`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Token ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[Delhivery Label API Error]:", res.status, text);
      return NextResponse.json({ error: `Failed to fetch packing slip from Delhivery: ${res.statusText}` }, { status: res.status });
    }

    const responseData = await res.json().catch(() => null);
    const pdfUrl = responseData?.packages?.[0]?.pdf_download_link || responseData?.pdf_download_link;

    if (!pdfUrl) {
      console.error("[Delhivery Label API No URL]:", responseData);
      return NextResponse.json({ error: "Delhivery did not return a PDF download link." }, { status: 502 });
    }

    // Now fetch the actual PDF binary from the S3 link
    const pdfRes = await fetch(pdfUrl, { cache: "no-store" });
    if (!pdfRes.ok) {
      return NextResponse.json({ error: "Failed to download PDF binary from S3 link." }, { status: 502 });
    }

    const pdfData = await pdfRes.arrayBuffer();

    return new NextResponse(Buffer.from(pdfData), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="packing_slip_${awb}.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch packing slip" }, { status: 500 });
  }
}
