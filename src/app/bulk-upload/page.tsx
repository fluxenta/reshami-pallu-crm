"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertTriangle, 
  ArrowRight,
  Download,
  Search,
  FileText,
  RefreshCw,
  ExternalLink,
  Image as ImageIcon
} from "lucide-react";

// CSV Template Headers
const TEMPLATE_HEADERS = [
  "Title",
  "Description",
  "Status",
  "Price",
  "CostPrice",
  "Stock",
  "SKU",
  "Tags",
  "Fabric",
  "Weave",
  "ColorFamily",
  "Occasion",
  "BlouseIncluded",
  "BlouseLength",
  "WashCare",
  "FoundersExclusive",
  "PrivateNotes"
];

const SAMPLE_ROW = [
  "Handwoven Banarasi Katan Silk Saree",
  "Exquisite handloom Banarasi saree in pure katan silk with intricate gold zari weave.",
  "DRAFT",
  "18500",
  "11000",
  "5",
  "RP-INV-1",
  "Banarasi, Silk, Zari",
  "Pure Katan Silk",
  "Kadhua",
  "Red",
  "Bridal",
  "TRUE",
  "80cm",
  "Dry Clean Only",
  "TRUE",
  "Procured from weaver Ramlal in Varanasi."
];

interface UploadReportItem {
  serialNumber: string;
  sku: string;
  title: string;
  price: number;
  costPrice: number;
  stock: number;
  fabric: string;
  weave: string;
  colors: string;
  imagesCount: number;
  images: string[];
  status: "success" | "failed";
  shopifyId?: string;
  error?: string;
  timestamp: string;
}

export default function BulkUploadPage() {
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [localUploading, setLocalUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  
  // Post-Upload Report States
  const [report, setReport] = useState<UploadReportItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");

  // Load existing report on mount if present
  useEffect(() => {
    fetch("/bulk-upload-report.json")
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("No report found");
      })
      .then(data => setReport(data))
      .catch(() => {});
  }, []);

  // Helper to generate and download the CSV template
  const downloadTemplate = () => {
    const csvContent = [
      TEMPLATE_HEADERS.join(","),
      SAMPLE_ROW.map(val => `"${val.replace(/"/g, '""')}"`).join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "reshami_pallu_saree_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Client-side CSV Parser for manual file uploading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    try {
      const lines: string[] = [];
      let currentLine = "";
      let inQuotes = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === '\n' && !inQuotes) {
          lines.push(currentLine);
          currentLine = "";
        } else {
          currentLine += char;
        }
      }
      if (currentLine) lines.push(currentLine);

      if (lines.length < 2) {
        alert("CSV is empty or missing data rows");
        return;
      }

      const parsedHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values: string[] = [];
        let curVal = "";
        let insideQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            insideQuotes = !insideQuotes;
          } else if (char === ',' && !insideQuotes) {
            values.push(curVal.trim().replace(/^"|"$/g, ""));
            curVal = "";
          } else {
            curVal += char;
          }
        }
        values.push(curVal.trim().replace(/^"|"$/g, ""));

        const item: any = {};
        parsedHeaders.forEach((header, idx) => {
          const normKey = header.toLowerCase().replace(/[\s_-]/g, "");
          item[normKey] = values[idx] || "";
        });

        if (!item.sku || !item.title) continue;
        if (item.title.includes("Name/Title of the Saree") || item.sku.includes("SKU")) continue;

        rows.push({
          title: item.title,
          description: item.description || "",
          status: item.status?.toUpperCase() === "ACTIVE" ? "ACTIVE" : "DRAFT",
          price: parseFloat(item.price) || 0,
          compareAtPrice: item.compareatprice ? parseFloat(item.compareatprice) : null,
          costPrice: parseFloat(item.costprice) || 0,
          stock: parseInt(item.stock) || 0,
          sku: item.sku,
          tags: item.tags ? item.tags.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean) : [],
          fabric: item.fabric || "Pure Silk",
          weave: item.weave || "Kadhua",
          colorFamily: item.colors || item.colorfamily || "Red",
          occasion: item.occasion || "Bridal",
          blouseIncluded: item.blouseincluded?.toUpperCase() === "TRUE",
          blouseLength: item.blouselength || "80cm",
          sareeLength: item.sareelength || "6.0",
          washCare: item.washcare || "Dry Clean Only",
          foundersExclusive: item.foundersexclusive?.toUpperCase() === "TRUE",
          privateNotes: item.privatenotes || ""
        });
      }

      setParsedRows(rows);
      setStatusLog([`✓ Successfully parsed ${rows.length} sarees from CSV. Ready for catalog push!`]);
    } catch (err) {
      alert("Failed to parse CSV: " + (err as Error).message);
    }
  };

  // Push parsed items sequentially (legacy browser file method)
  const startBulkUpload = async () => {
    if (parsedRows.length === 0) return;
    setUploading(true);
    setProgress(0);
    setSuccess(false);

    const logs: string[] = [];
    
    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      logs.push(`⏳ [${i + 1}/${parsedRows.length}] Publishing SKU ${row.sku}: ${row.title}...`);
      setStatusLog([...logs]);

      try {
        const payload = {
          title: row.title,
          descriptionHtml: `<p>${row.description.replace(/\n/g, "<br />")}</p>`,
          status: row.status,
          price: row.price,
          compareAtPrice: row.compareAtPrice,
          costPrice: row.costPrice,
          stock: row.stock,
          sku: row.sku,
          tags: row.tags,
          metafields: {
            fabric: row.fabric,
            weave: row.weave,
            colorFamily: row.colorFamily,
            occasion: row.occasion,
            blouseIncluded: row.blouseIncluded,
            blouseLength: row.blouseIncluded ? row.blouseLength : "",
            sareeLength: parseFloat(row.sareeLength || "6.0").toFixed(1) + " meters",
            washCare: row.washCare,
            foundersExclusive: row.foundersExclusive
          },
          privateNotes: row.privateNotes
        };

        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Push failed");
        }

        logs[logs.length - 1] = `✅ [${i + 1}/${parsedRows.length}] Successfully created Saree: ${row.sku}`;
      } catch (err) {
        logs[logs.length - 1] = `❌ [${i + 1}/${parsedRows.length}] Failed to create Saree ${row.sku}: ${(err as Error).message}`;
      }

      setStatusLog([...logs]);
      setProgress(Math.round(((i + 1) / parsedRows.length) * 100));
    }

    setUploading(false);
    setSuccess(true);
    setParsedRows([]);
  };

  // Trigger Local Server-Side Batch Media Upload
  const startLocalBatchUpload = async () => {
    if (confirm("Are you sure you want to run the local batch media uploader? This will optimize and upload images from 'data/inventory/' and publish listings to Shopify.")) {
      setLocalUploading(true);
      setSuccess(false);
      try {
        const res = await fetch("/api/admin/bulk-upload-local", {
          method: "POST"
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Batch upload failed");
        }
        const data = await res.json();
        setReport(data.report);
        setSuccess(true);
      } catch (err: any) {
        alert("Local Batch Upload Failed: " + err.message);
      } finally {
        setLocalUploading(false);
      }
    }
  };

  // Download Post-Upload Report as CSV
  const downloadReportCSV = () => {
    if (report.length === 0) return;
    const headers = ["Serial Number", "SKU", "Title", "Price", "Cost Price", "Stock", "Fabric", "Weave", "Colors", "Images Count", "Status", "Shopify ID", "Error"];
    const csvContent = [
      headers.join(","),
      ...report.map(item => [
        item.serialNumber,
        item.sku,
        `"${item.title.replace(/"/g, '""')}"`,
        item.price,
        item.costPrice,
        item.stock,
        `"${item.fabric.replace(/"/g, '""')}"`,
        `"${item.weave.replace(/"/g, '""')}"`,
        `"${item.colors.replace(/"/g, '""')}"`,
        item.imagesCount,
        item.status,
        item.shopifyId || "",
        `"${(item.error || "").replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `bulk_upload_report_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter and search report
  const filteredReport = report.filter(item => {
    const matchesSearch = item.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const successCount = report.filter(r => r.status === "success").length;
  const failedCount = report.filter(r => r.status === "failed").length;

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Bulk Saree & Media Upload" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1200px] mx-auto w-full space-y-6 sm:space-y-8">
          
          {/* Quick Actions Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/60 border border-[#4A154B]/10 rounded-2xl p-6 backdrop-blur-md">
            <div>
              <h2 className="font-display font-extrabold text-lg text-[#4A154B]">Local File & Media Synchronizer</h2>
              <p className="text-xs text-[#1A1A1A]/60 mt-1">
                Reads cleaned CSV details and maps optimized image files directly from local storage folders.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <a 
                href="/api/admin/download-cleaned-csv"
                className="btn-secondary flex items-center gap-1.5 py-2.5 px-4 text-xs font-semibold uppercase tracking-wider"
              >
                <Download size={14} />
                Download Cleaned CSV
              </a>
              
              <button
                onClick={startLocalBatchUpload}
                disabled={localUploading || uploading}
                className={`btn-primary flex items-center gap-1.5 py-2.5 px-5 text-xs font-bold uppercase tracking-wider shadow-md ${
                  (localUploading || uploading) ? "opacity-50 !cursor-not-allowed" : ""
                }`}
              >
                <RefreshCw size={14} className={localUploading ? "animate-spin" : ""} />
                {localUploading ? "Uploading Media..." : "Run Local Media Batch Sync"}
              </button>
            </div>
          </div>

          {/* Setup Instructions Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="ui-card p-6 bg-white/40 border border-[#4A154B]/5 space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">Step 1</span>
              <h3 className="font-display font-bold text-sm text-[#4A154B]">Clean and Prepare CSV</h3>
              <p className="text-xs text-[#1A1A1A]/60">
                Generate clean auto-increment SKUs, filter nil data, set pp prices to 0, and Title Case property names.
              </p>
            </div>
            <div className="ui-card p-6 bg-white/40 border border-[#4A154B]/5 space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">Step 2</span>
              <h3 className="font-display font-bold text-sm text-[#4A154B]">Match Media Folders</h3>
              <p className="text-xs text-[#1A1A1A]/60">
                Place image shoots in <code className="bg-[#4A154B]/5 px-1 font-mono rounded">data/inventory/[Serial_Number]</code>. Empty folders are skipped gracefully.
              </p>
            </div>
            <div className="ui-card p-6 bg-white/40 border border-[#4A154B]/5 space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">Step 3</span>
              <h3 className="font-display font-bold text-sm text-[#4A154B]">Push Live & Audit</h3>
              <p className="text-xs text-[#1A1A1A]/60">
                Click "Run Local Media Batch Sync" to optimize images, create listings in Shopify, and audit the upload status.
              </p>
            </div>
          </div>

          {/* Interactive Post-Upload Sync Report Dashboard */}
          {report.length > 0 && (
            <div className="ui-card p-6 space-y-6 bg-white shadow-xl rounded-2xl border border-gray-100">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-100 pb-4 gap-4">
                <div>
                  <h3 className="font-display font-extrabold text-base text-[#4A154B] flex items-center gap-2">
                    <FileText size={18} className="text-[#D4AF37]" />
                    Post-Upload Sync Report
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Audit log of Shopify creation requests, Weaver cost records, and Media CDN uploads.</p>
                </div>
                
                <button
                  onClick={downloadReportCSV}
                  className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-xs tracking-wider uppercase font-semibold"
                >
                  <Download size={14} />
                  Export Report (CSV)
                </button>
              </div>

              {/* Stats Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Items</span>
                  <div className="text-xl font-display font-black text-gray-800 mt-1">{report.length}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                  <span className="text-[10px] uppercase font-bold text-green-500 tracking-wider">Successful Syncs</span>
                  <div className="text-xl font-display font-black text-green-700 mt-1">{successCount}</div>
                </div>
                <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                  <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Failed Items</span>
                  <div className="text-xl font-display font-black text-red-700 mt-1">{failedCount}</div>
                </div>
                <div className="bg-[#FAF8F5] rounded-xl p-4 border border-[#4A154B]/5">
                  <span className="text-[10px] uppercase font-bold text-[#4A154B]/60 tracking-wider">Images Attached</span>
                  <div className="text-xl font-display font-black text-[#4A154B] mt-1">
                    {report.reduce((sum, item) => sum + item.imagesCount, 0)}
                  </div>
                </div>
              </div>

              {/* Filters and Search */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search by SKU or title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs w-full focus:outline-none focus:border-[#4A154B]"
                  />
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setStatusFilter("all")}
                    className={`py-2 px-4 rounded-xl text-xs font-semibold border transition-all ${
                      statusFilter === "all" 
                        ? "bg-[#4A154B] text-white border-[#4A154B]" 
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter("success")}
                    className={`py-2 px-4 rounded-xl text-xs font-semibold border transition-all ${
                      statusFilter === "success" 
                        ? "bg-green-600 text-white border-green-600" 
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Success
                  </button>
                  <button
                    onClick={() => setStatusFilter("failed")}
                    className={`py-2 px-4 rounded-xl text-xs font-semibold border transition-all ${
                      statusFilter === "failed" 
                        ? "bg-red-600 text-white border-red-600" 
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Failed
                  </button>
                </div>
              </div>

              {/* Clean Table View */}
              <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                <table className="min-w-full divide-y divide-gray-100 text-xs">
                  <thead className="bg-gray-50 font-bold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">SKU</th>
                      <th className="px-4 py-3 text-left">Saree Details</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-center">Stock</th>
                      <th className="px-4 py-3 text-center">Images</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredReport.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-[#4A154B]">
                          {item.sku}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-gray-800">{item.title}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {item.fabric} • {item.weave}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-gray-800">
                          ₹{item.price.toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right text-gray-500">
                          ₹{item.costPrice.toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-center font-bold text-gray-700">
                          {item.stock}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-center items-center gap-1">
                            {item.images.slice(0, 3).map((url, i) => (
                              <div key={i} className="relative w-6 h-6 rounded-full overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                                <img src={url} alt="thumbnail" className="object-cover w-full h-full" />
                              </div>
                            ))}
                            {item.imagesCount > 3 && (
                              <span className="text-[9px] font-bold text-gray-400">+{item.imagesCount - 3}</span>
                            )}
                            {item.imagesCount === 0 && (
                              <span className="text-gray-300"><ImageIcon size={14} /></span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                            item.status === "success" 
                              ? "bg-green-50 text-green-700 border-green-200" 
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {item.status === "success" ? (
                            <a
                              href={`https://admin.shopify.com/store/reshmi-pallu/products/${item.shopifyId?.replace("gid://shopify/Product/", "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 hover:underline font-semibold"
                            >
                              <span>Shopify</span>
                              <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-red-500 font-medium max-w-xs block truncate" title={item.error}>
                              {item.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Standard CSV Parser Box (Legacy Mode fallback) */}
          <div className="ui-card p-6 space-y-4 bg-white/40">
            <h3 className="font-display font-bold text-sm text-[#4A154B]">Browser Upload Fallback (Manual Mode)</h3>
            <p className="text-xs text-[#1A1A1A]/60">
              Drag & drop a custom CSV if you want to upload items without sync-checking local media files directly.
            </p>
            
            {/* Drag & Drop Upload Zone */}
            <div className="p-8 flex flex-col items-center justify-center border-dashed border-[#4A154B]/20 text-center relative bg-[#FAF8F5]/30 rounded-xl">
              <UploadCloud size={40} className="text-[#4A154B]/50 mb-3" />
              <h4 className="text-[#4A154B] font-display font-bold text-sm">Upload CSV File</h4>
              <p className="text-xs text-[#1A1A1A]/50 mt-1 mb-6">Select your CSV file. We will instantly parse attributes.</p>
              
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                disabled={uploading || localUploading}
              />
            </div>

            {/* Parsing progress & log outputs */}
            {statusLog.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-[#4A154B]/5">
                <h4 className="font-display font-bold text-sm text-[#4A154B]">
                  Legacy Parser Activity Monitor
                </h4>
                
                {uploading && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[#4A154B] font-bold">
                      <span>Uploading Saree data...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-[#4A154B]/5 rounded-full overflow-hidden border border-[#4A154B]/10">
                      <div className="h-full bg-[#4A154B] transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                <div className="h-32 overflow-y-auto bg-[#1A1A1A] rounded-xl p-4 font-mono text-[10px] text-green-400 space-y-1">
                  {statusLog.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                </div>

                {parsedRows.length > 0 && !uploading && (
                  <div className="flex justify-between items-center">
                    <button 
                      onClick={downloadTemplate}
                      className="text-xs font-semibold text-[#4A154B] hover:underline flex items-center gap-1"
                    >
                      <Download size={12} />
                      CSV Template
                    </button>
                    <button
                      onClick={startBulkUpload}
                      className="btn-primary py-2.5 px-6 text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5 shadow-md"
                    >
                      <span>Push {parsedRows.length} Sarees</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
