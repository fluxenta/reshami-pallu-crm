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
  const [success, setSuccess] = useState(false);
  
  // Post-Upload Report States (only loaded on successful sync)
  const [report, setReport] = useState<UploadReportItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");

  // Cached Sarees Database States
  const [existingSarees, setExistingSarees] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<any[]>([]);
  const [loadingSarees, setLoadingSarees] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [sheetSearchQuery, setSheetSearchQuery] = useState("");

  // Sync Progress State
  const [syncProgress, setSyncProgress] = useState<{ step: number; text: string; status: string; log: string } | null>(null);

  // Google Sheet & Drive URLs (hardcoded as per user request)
  const sheetUrl = "https://docs.google.com/spreadsheets/d/1vdxcGu_rxqJLSW7HJcRPhrek-WLMBtIAccIfnfwTswA/edit?gid=1836349698#gid=1836349698";
  const driveUrl = "https://drive.google.com/drive/u/4/folders/1mxvLUG0u-RIH9Uoxt4q7nWvEQY1dPxPD";
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: "alert" | "confirm";
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const showAlert = (title: string, message: string) => {
    setDialog({
      isOpen: true,
      type: "alert",
      title,
      message,
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialog({
      isOpen: true,
      type: "confirm",
      title,
      message,
      onConfirm,
    });
  };

  const fetchExistingSarees = async (forceRefresh = false) => {
    setLoadingSarees(true);
    try {
      const res = await fetch(`/api/admin/google-sync?refresh=${forceRefresh}`);
      if (!res.ok) {
        throw new Error("Failed to load Google Sheet cache data");
      }
      const data = await res.json();
      if (data.success) {
        setExistingSarees(data.items || []);
        setValidationErrors(data.validationErrors || []);
        setIsCached(data.cached);
      }
    } catch (err: any) {
      console.error("[Google Sync Page] Error fetching cached sheet data:", err);
    } finally {
      setLoadingSarees(false);
    }
  };

  useEffect(() => {
    fetchExistingSarees(false);
  }, []);

  const executeGoogleSync = async () => {
    setGoogleSyncing(true);
    setSuccess(false);
    setReport([]);
    setSyncProgress({ step: 1, text: "Validating spreadsheet catalog...", status: "active", log: "Starting direct workspace sync..." });

    // Poll progress every 1.5 seconds
    const interval = setInterval(async () => {
      try {
        const progressRes = await fetch("/api/admin/google-sync?progress=true");
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setSyncProgress(progressData);
        }
      } catch (err) {
        console.error("Progress polling error:", err);
      }
    }, 1500);

    try {
      const res = await fetch("/api/admin/google-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl, driveUrl }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Google sync failed");
      }
      const data = await res.json();
      if (data.message === "Nothing to sync") {
        showAlert("Sync Complete", "Nothing to sync! All sarees in your sheet are already published and up to date, or Drive photoshoot folders are empty.");
        setReport([]);
        setSuccess(false);
      } else {
        setReport(data.report || []);
        setSuccess(true);
      }
      // Reload inventory view forcing refresh after action completes
      fetchExistingSarees(true);
    } catch (err: any) {
      showAlert("Sync Failure", err.message || "An unexpected error occurred during sync.");
    } finally {
      clearInterval(interval);
      setGoogleSyncing(false);
      setSyncProgress(null);
    }
  };

  const startGoogleSync = () => {
    if (!sheetUrl || !driveUrl) {
      showAlert("Configuration Missing", "Please ensure Google Sheet and Google Drive Folder URLs are set up.");
      return;
    }
    showConfirm(
      "Confirm Workspace Sync",
      "Are you sure you want to run the Google Sync? This will fetch your Google Sheet, download & optimize images from your Google Drive, and sync the catalog live to Shopify with automated AI photoshoot generation.",
      executeGoogleSync
    );
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
          
          <div className="space-y-6">
            {/* Google Sync UI */}
            <div className="bg-white/60 border border-[#4A154B]/10 rounded-2xl p-6 backdrop-blur-md space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="font-display font-extrabold text-lg text-[#4A154B]">Google Workspace Direct Sync</h2>
                  <p className="text-xs text-[#1A1A1A]/60 mt-1">
                    Triggers a direct sync with your connected Google Sheet catalog and Google Drive saree folders.
                  </p>
                </div>

                <div>
                  <button
                    onClick={startGoogleSync}
                    disabled={googleSyncing}
                    className={`btn-primary flex items-center gap-1.5 py-3 px-8 text-xs font-bold uppercase tracking-wider shadow-md cursor-pointer ${
                      googleSyncing ? "opacity-50 !cursor-not-allowed" : ""
                    }`}
                  >
                    <RefreshCw size={14} className={googleSyncing ? "animate-spin" : ""} />
                    {googleSyncing ? "Syncing Workspace..." : "Start Google Direct Sync"}
                  </button>
                </div>
              </div>
            </div>

            {googleSyncing && (
              <div className="bg-[#4A154B]/5 border border-[#4A154B]/15 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="animate-spin text-[#4A154B]" size={20} />
                  <div>
                    <h3 className="font-display font-extrabold text-sm text-[#4A154B]">Workspace Direct Sync Active</h3>
                    <p className="text-[10px] text-gray-500">Processing sheet rows, downloading images, and running AI Lookbook generations sequentially.</p>
                  </div>
                </div>
                
                {/* Stepper */}
                <div className="space-y-3 pt-2">
                  {[
                    { num: 1, text: "Parse Google Sheet catalog rows and validate structure" },
                    { num: 2, text: "Map serial numbers to Google Drive image subfolders" },
                    { num: 3, text: "Download raw saree photoshoot assets to local storage" },
                    { num: 4, text: "Execute Gemini fabric analysis & Imagen AI Lookbook try-on generations" },
                    { num: 5, text: "Publish optimized lookbooks to Shopify catalog and sync Upstash Redis" }
                  ].map((step, idx) => {
                    const isCompleted = syncProgress ? syncProgress.step > step.num : false;
                    const isActive = syncProgress ? syncProgress.step === step.num : false;
                    const isFuture = syncProgress ? syncProgress.step < step.num : true;

                    let badgeStyle = "bg-gray-100 text-gray-400";
                    let textStyle = "text-gray-400";

                    if (isCompleted) {
                      badgeStyle = "bg-green-100 text-green-700 font-bold";
                      textStyle = "text-gray-600 line-through decoration-green-300 decoration-1";
                    } else if (isActive) {
                      badgeStyle = "bg-[#4A154B] text-white animate-pulse font-bold";
                      textStyle = "text-[#4a154b] font-bold";
                    } else if (!isFuture) {
                      badgeStyle = "bg-[#4A154B]/10 text-[#4A154B]";
                      textStyle = "text-gray-600 font-medium";
                    }

                    return (
                      <div key={idx} className="flex items-start gap-3 text-xs transition-all duration-300">
                        <span className={`flex items-center justify-center w-5 h-5 rounded-full font-bold text-[10px] shrink-0 ${badgeStyle}`}>
                          {isCompleted ? "✓" : step.num}
                        </span>
                        <div className="space-y-1">
                          <span className={`transition-colors duration-300 ${textStyle}`}>{step.text}</span>
                          {isActive && syncProgress && syncProgress.log && (
                            <div className="text-[10px] text-[#4A154B]/70 font-semibold italic bg-[#4A154B]/5 border border-[#4A154B]/10 rounded-lg p-2 max-w-lg animate-fadeIn">
                              {syncProgress.log}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3.5 flex items-center gap-2 mt-2">
                  <span className="text-sm">⚠️</span>
                  <div>
                    <strong className="font-bold">PLEASE DO NOT CLOSE THIS TAB.</strong> Running the AI photoshoot pipeline and Shopify CDN uploads takes a few minutes per saree.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Diagnostics Panel / Strong Guardrails */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border-2 border-red-200/80 rounded-2xl p-6 space-y-4 shadow-sm animate-fadeIn">
              <div className="flex items-center gap-2.5 text-red-800">
                <AlertTriangle className="text-red-600 shrink-0" size={22} />
                <div>
                  <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">Sheet Diagnostics & Guardrail Warnings</h3>
                  <p className="text-[10px] text-red-700/80 font-medium">We detected issues in {validationErrors.length} saree records in your Google Sheet. Fix these columns before syncing to ensure flawless Shopify ingestion.</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-red-150 rounded-xl bg-white max-h-60 overflow-y-auto">
                <table className="min-w-full divide-y divide-red-100 text-xs">
                  <thead className="bg-red-50/50 font-bold uppercase tracking-wider text-red-700">
                    <tr>
                      <th className="px-4 py-2.5 text-left w-16">Row</th>
                      <th className="px-4 py-2.5 text-left w-24">Saree #</th>
                      <th className="px-4 py-2.5 text-left w-48">SKU / Title</th>
                      <th className="px-4 py-2.5 text-left">Validation Errors & Actions to Fix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {validationErrors.map((err, idx) => (
                      <tr key={idx} className="hover:bg-red-50/20">
                        <td className="px-4 py-2.5 font-mono text-red-600 font-bold">{err.rowNumber}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-700">{err.serialNumber}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-gray-800 text-[11px] truncate max-w-xs">{err.title}</div>
                          <div className="text-[9px] text-gray-400 font-mono">{err.sku}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <ul className="list-disc list-inside space-y-0.5 text-red-700 text-[11px] font-medium">
                            {err.errors.map((msg: string, i: number) => (
                              <li key={i}>{msg}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Google Sheet Inventory Database */}
          <div className="bg-white border border-[#4A154B]/10 rounded-2xl p-6 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-extrabold text-base text-[#4A154B]">
                    Google Sheet Database View
                  </h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    isCached 
                      ? "bg-amber-50 text-amber-700 border border-amber-200" 
                      : "bg-green-50 text-green-700 border border-green-200"
                  }`}>
                    {isCached ? "Local Cache" : "Live Sheet"}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500">
                  Showing saree details parsed from your spreadsheet cache file.
                </p>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <Search size={13} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search cached inventory..."
                    value={sheetSearchQuery}
                    onChange={(e) => setSheetSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs w-full sm:w-48 focus:outline-none focus:border-[#4A154B]"
                  />
                </div>
                
                <button
                  onClick={() => fetchExistingSarees(true)}
                  disabled={loadingSarees || googleSyncing}
                  title="Force refresh data from Google Sheet API"
                  className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 transition-all flex items-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={loadingSarees ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
            </div>

            {loadingSarees ? (
              /* Premium Skeleton UI */
              <div className="space-y-4 animate-pulse">
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 h-10 w-full border-b border-gray-100"></div>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex justify-between items-center px-4 py-3.5 border-b border-gray-100 last:border-0">
                      <div className="h-4 w-12 bg-gray-200 rounded"></div>
                      <div className="h-4 w-24 bg-gray-200 rounded"></div>
                      <div className="h-4 w-40 bg-gray-200 rounded"></div>
                      <div className="h-4 w-16 bg-gray-200 rounded"></div>
                      <div className="h-4 w-12 bg-gray-200 rounded"></div>
                      <div className="h-4 w-12 bg-gray-200 rounded"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="min-w-full divide-y divide-gray-100 text-xs">
                  <thead className="bg-gray-50 font-bold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left w-12">#</th>
                      <th className="px-4 py-3 text-left">SKU</th>
                      <th className="px-4 py-3 text-left">Title</th>
                      <th className="px-4 py-3 text-left">Fabric & Weave</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-center">Stock</th>
                      <th className="px-4 py-3 text-center">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {existingSarees
                      .filter(item => {
                        if (!sheetSearchQuery) return true;
                        const q = sheetSearchQuery.toLowerCase();
                        return (
                          item.sku.toLowerCase().includes(q) ||
                          item.title.toLowerCase().includes(q) ||
                          item.fabric.toLowerCase().includes(q) ||
                          item.weave.toLowerCase().includes(q) ||
                          item.serialNumber.toLowerCase().includes(q)
                        );
                      })
                      .map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-gray-400">
                            {item.serialNumber}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-[#4A154B]">
                            {item.sku}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-gray-800">{item.title}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-gray-500 font-semibold">{item.fabric}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{item.weave} • {item.colors}</div>
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
                          <td className="px-4 py-3.5 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                              item.uploaded === "Y"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>
                              {item.uploaded === "Y" ? "Uploaded" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    {existingSarees.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400 font-medium">
                          No sarees found in the sheet database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>


          {/* Interactive Post-Upload Sync Report Dashboard */}
          {success && report.length > 0 && (
            <div className="ui-card p-6 space-y-6 bg-white shadow-xl rounded-2xl border border-gray-100">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-100 pb-4 gap-4">
                <div>
                  <h3 className="font-display font-extrabold text-base text-[#4A154B] flex items-center gap-2">
                    <FileText size={18} className="text-[#D4AF37]" />
                    Post-Upload Sync Report
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Audit log of Shopify creation requests, Weaver cost records, and Media CDN uploads.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href="/api/admin/download-photos-zip?serialNumber=all"
                    className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-xs tracking-wider uppercase font-semibold text-center justify-center bg-[#4A154B]/5 hover:bg-[#4A154B]/10 text-[#4A154B] border-none"
                  >
                    <Download size={14} />
                    Download All Photos (ZIP)
                  </a>
                  <button
                    onClick={downloadReportCSV}
                    className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-xs tracking-wider uppercase font-semibold text-center justify-center"
                  >
                    <Download size={14} />
                    Export Report (CSV)
                  </button>
                </div>
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
                        <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-2.5">
                          {item.status === "success" ? (
                            <>
                              <a
                                href={`/api/admin/download-photos-zip?serialNumber=${item.serialNumber}`}
                                className="text-[#4A154B] hover:text-[#3D113E] inline-flex items-center gap-0.5 hover:underline font-semibold"
                              >
                                <span>Download ZIP</span>
                                <Download size={10} />
                              </a>
                              <span className="text-gray-300">|</span>
                              <a
                                href={`https://admin.shopify.com/store/reshmi-pallu/products/${item.shopifyId?.replace("gid://shopify/Product/", "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 hover:underline font-semibold"
                              >
                                <span>Shopify</span>
                                <ExternalLink size={10} />
                              </a>
                            </>
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
          {/* Custom Dialog Modal */}
          {dialog?.isOpen && (
            <div className="fixed inset-0 bg-[#4A154B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300">
              <div className="bg-white border border-[#4A154B]/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 scale-100 transition-all duration-300">
                <div className="flex items-center gap-2 text-[#4A154B]">
                  <AlertTriangle size={18} className="text-[#D4AF37]" />
                  <h3 className="font-display font-bold text-xs uppercase tracking-wider">{dialog.title}</h3>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed font-semibold">{dialog.message}</p>
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  {dialog.type === "confirm" ? (
                    <>
                      <button
                        onClick={() => setDialog(null)}
                        className="px-4 py-2 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 text-xs font-bold uppercase transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const onConfirm = dialog.onConfirm;
                          setDialog(null);
                          if (onConfirm) onConfirm();
                        }}
                        className="px-5 py-2 bg-[#4A154B] text-white rounded-xl hover:bg-[#3D113E] text-xs font-bold uppercase transition-all cursor-pointer"
                      >
                        Confirm
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDialog(null)}
                      className="px-5 py-2 bg-[#4A154B] text-white rounded-xl hover:bg-[#3D113E] text-xs font-bold uppercase transition-all cursor-pointer"
                    >
                      Okay
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
