"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { 
  Sparkles, 
  Tag, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  DollarSign, 
  Layers, 
  Percent, 
  Save, 
  Plus, 
  Trash2,
  Bookmark
} from "lucide-react";

const REGION_CODES: Record<string, string> = {
  "Banaras": "BNR",
  "Kanchipuram": "KNP",
  "Chanderi": "CHD",
  "Kalamkari": "KLM",
  "Mysore": "MYS",
  "Other": "OTH"
};

const COLOR_CODES: Record<string, string> = {
  "Red": "RED",
  "Blue": "BLU",
  "Green": "GRN",
  "Gold": "GLD",
  "Silver": "SLV",
  "Pink": "PNK",
  "White": "WHT",
  "Black": "BLK",
  "Maroon": "MRN",
  "Purple": "PUR",
  "Cream": "CRM",
  "Orange": "ORG",
  "Yellow": "YLW",
  "Turquoise": "TRQ"
};

export default function AddProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skuNumber, setSkuNumber] = useState(1);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT">("DRAFT");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  // Media
  const [images, setImages] = useState<Array<{ id: string, url: string }>>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [video, setVideo] = useState<{ id: string, url: string } | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [mediaStatuses, setMediaStatuses] = useState<Record<string, { status: string, error?: string | null }>>({});
  const [existingTags, setExistingTags] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/collections")
      .then(res => res.json())
      .then(data => {
        const colls = data.collections || [];
        const tags = colls
          .map((c: any) => c.rules?.find((r: any) => r.column === "TAG")?.condition)
          .filter((t: any): t is string => Boolean(t) && t !== "Founders-Exclusive");
        setExistingTags(Array.from(new Set(tags)));
      })
      .catch(() => {});
  }, []);

  // Metafields
  const [fabric, setFabric] = useState("");
  const [weave, setWeave] = useState("");
  const [colorFamily, setColorFamily] = useState("");
  const [occasion, setOccasion] = useState("");
  const [region, setRegion] = useState("");
  const [blouseIncluded, setBlouseIncluded] = useState(true);
  const [blouseLength, setBlouseLength] = useState("0.8 meters");
  const [sareeLength, setSareeLength] = useState("6.0");
  const [washCare, setWashCare] = useState("");
  const [foundersExclusive, setFoundersExclusive] = useState(false);
  const [privateNotes, setPrivateNotes] = useState("");

  // Dynamic Options lists loaded from Upstash Redis
  const [customRegions, setCustomRegions] = useState<string[]>([]);
  const [customFabrics, setCustomFabrics] = useState<string[]>([]);
  const [customWeaves, setCustomWeaves] = useState<string[]>([]);
  const [customOccasions, setCustomOccasions] = useState<string[]>([]);
  const [customColorFamilies, setCustomColorFamilies] = useState<string[]>([]);

  // Text inputs for "Other" custom typed selections
  const [customRegion, setCustomRegion] = useState("");
  const [customFabric, setCustomFabric] = useState("");
  const [customWeave, setCustomWeave] = useState("");
  const [customOccasion, setCustomOccasion] = useState("");
  const [customColorFamily, setCustomColorFamily] = useState("");

  // Dynamic selector options
  const regionOptions = Array.from(new Set(["Banaras", "Kanchipuram", "Chanderi", "Kalamkari", "Mysore", ...customRegions, "Other"])).filter(Boolean) as string[];
  const colorFamilyOptions = Array.from(new Set(["Red", "Blue", "Green", "Gold", "Silver", "Pink", "White", "Black", "Maroon", "Purple", "Cream", "Orange", "Yellow", "Turquoise", ...customColorFamilies, "Other"])).filter(Boolean) as string[];
  const fabricOptions = Array.from(new Set(["Pure Katan Silk", "Pure Silk", "Chanderi Silk", "Georgette", "Organza", "Tissue Silk", "Cotton", ...customFabrics, "Other"])).filter(Boolean) as string[];
  const weaveOptions = Array.from(new Set(["Kadhua", "Jamdani", "Ikat", "Meenakari", "Fekwa", ...customWeaves, "Other"])).filter(Boolean) as string[];
  const occasionOptions = Array.from(new Set(["Bridal", "Festive", "Cocktail", "Casual", ...customOccasions, "Other"])).filter(Boolean) as string[];

  // SKU Generation logic
  const [sku, setSku] = useState("");

  // Load custom options on page mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch("/api/options");
        if (res.ok) {
          const data = await res.json();
          setCustomRegions(data.regions || []);
          setCustomFabrics(data.fabrics || []);
          setCustomWeaves(data.weaves || []);
          setCustomOccasions(data.occasions || []);
          setCustomColorFamilies(data.colorFamilies || []);
        }
      } catch (err) {
        console.error("Failed to load options", err);
      }
    };
    fetchOptions();
  }, []);

  useEffect(() => {
    // Generate SKU automatically
    const selectedRegion = region === "Other" ? customRegion : region;
    const selectedColor = colorFamily === "Other" ? customColorFamily : colorFamily;

    let regCode = REGION_CODES[selectedRegion];
    if (!regCode) {
      regCode = selectedRegion ? selectedRegion.slice(0, 3).toUpperCase() : "OTH";
    }

    let colorCode = COLOR_CODES[selectedColor];
    if (!colorCode) {
      colorCode = selectedColor ? selectedColor.slice(0, 3).toUpperCase() : "OTH";
    }

    const numStr = String(skuNumber).padStart(3, "0");
    setSku(`RP-${colorCode}-${numStr}`);
  }, [colorFamily, customColorFamily, skuNumber]);

  // Fetch stock counts to auto-increment SKU numbers
  useEffect(() => {
    const fetchLatestNumber = async () => {
      try {
        const selectedColor = colorFamily === "Other" ? customColorFamily : colorFamily;
        let colorCode = COLOR_CODES[selectedColor];
        if (!colorCode) {
          colorCode = selectedColor ? selectedColor.slice(0, 3).toUpperCase() : "OTH";
        }
        const res = await fetch("/api/products/sku-count?color=" + encodeURIComponent(colorCode));
        if (res.ok) {
          const data = await res.json();
          setSkuNumber(data.count + 1);
        }
      } catch {
        // Fallback default
        setSkuNumber(Math.floor(Math.random() * 100) + 1);
      }
    };
    fetchLatestNumber();
  }, [colorFamily, customColorFamily]);

  // Live Margin Calculation
  const priceVal = parseFloat(price) || 0;
  const costVal = parseFloat(costPrice) || 0;
  const profitMargin = priceVal > 0 ? ((priceVal - costVal) / priceVal) * 100 : 0;

  // Margin color helper
  const getMarginColor = () => {
    if (profitMargin >= 40) return "text-green-600 bg-green-50 border-green-200";
    if (profitMargin >= 20) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  // Image Upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setImages(prev => [...prev, data]);
      setMediaStatuses(prev => ({ ...prev, [data.id]: { status: "queued" } }));
    } catch (err) {
      alert("Image upload failed: " + (err as Error).message);
    } finally {
      setUploadingImage(false);
    }
  };

  // Video Upload handler
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Video upload failed");
      const data = await res.json();
      setVideo(data);
      setMediaStatuses(prev => ({ ...prev, [data.id]: { status: "queued" } }));
    } catch (err) {
      alert("Video upload failed: " + (err as Error).message);
    } finally {
      setUploadingVideo(false);
    }
  };

  // Poll media queue statuses
  useEffect(() => {
    const activeIds = Object.keys(mediaStatuses).filter(
      (id) => mediaStatuses[id].status === "queued" || mediaStatuses[id].status === "processing"
    );

    if (activeIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const id of activeIds) {
        try {
          const res = await fetch(`/api/upload/status?id=${id}`);
          if (res.ok) {
            const data = await res.json();
            setMediaStatuses((prev) => ({
              ...prev,
              [id]: { status: data.status, error: data.error },
            }));
          }
        } catch (err) {
          console.error("Failed to fetch media status:", err);
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [mediaStatuses]);

  const isMediaSyncing = Object.values(mediaStatuses).some(
    (item) => item.status === "queued" || item.status === "processing"
  );

  // Tag Management
  const addTag = () => {
    if (tags.length >= 3) {
      alert("❌ You can add a maximum of 3 tags to a particular Saree.");
      return;
    }
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (t: string) => {
    setTags(tags.filter(tag => tag !== t));
  };

  // Save Saree Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const finalRegion = region === "Other" ? customRegion.trim() : region;
    const finalFabric = fabric === "Other" ? customFabric.trim() : fabric;
    const finalWeave = weave === "Other" ? customWeave.trim() : weave;
    const finalOccasion = occasion === "Other" ? customOccasion.trim() : occasion;
    const finalColorFamily = colorFamily === "Other" ? customColorFamily.trim() : colorFamily;

    // Check mandatory fields
    if (!finalColorFamily) {
      alert("❌ Error: Colour is mandatory. Please select a color.");
      setLoading(false);
      return;
    }
    if (!finalFabric) {
      alert("❌ Error: Fabric Type is mandatory. Please select a fabric.");
      setLoading(false);
      return;
    }
    if (!finalOccasion) {
      alert("❌ Error: Occasion Curation is mandatory. Please select an occasion.");
      setLoading(false);
      return;
    }

    if (
      (region === "Other" && !finalRegion) ||
      (fabric === "Other" && !finalFabric) ||
      (weave === "Other" && !finalWeave) ||
      (occasion === "Other" && !finalOccasion) ||
      (colorFamily === "Other" && !finalColorFamily)
    ) {
      alert("❌ Error: Please specify a custom text name for the fields selected as 'Other'.");
      setLoading(false);
      return;
    }

    try {
      // 1. Save new custom options to Upstash Redis
      const savePromises = [];
      if (region === "Other") {
        savePromises.push(fetch("/api/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "regions", value: finalRegion })
        }));
      }
      if (fabric === "Other") {
        savePromises.push(fetch("/api/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "fabrics", value: finalFabric })
        }));
      }
      if (weave === "Other") {
        savePromises.push(fetch("/api/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "weaves", value: finalWeave })
        }));
      }
      if (occasion === "Other") {
        savePromises.push(fetch("/api/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "occasions", value: finalOccasion })
        }));
      }
      if (colorFamily === "Other") {
        savePromises.push(fetch("/api/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "colorFamilies", value: finalColorFamily })
        }));
      }

      if (savePromises.length > 0) {
        await Promise.all(savePromises);
      }

      // 2. Prepare Shopify / Redis payload
      const payload = {
        title,
        descriptionHtml: `<p>${description.replace(/\n/g, "<br />")}</p>`,
        status,
        price: parseFloat(price),
        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
        costPrice: parseFloat(costPrice || "0"),
        stock: parseInt(stock || "0"),
        sku,
        tags,
        images,
        metafields: {
          fabric: finalFabric,
          weave: finalWeave,
          colorFamily: finalColorFamily,
          occasion: finalOccasion,
          region: finalRegion,
          blouseIncluded,
          blouseLength: blouseIncluded ? blouseLength : "",
          washCare,
          sareeLength: parseFloat(sareeLength || "6.0").toFixed(1) + " meters",
          shortVideo: video ? { id: video.id, url: video.url } : undefined,
          foundersExclusive
        },
        privateNotes
      };

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save product");
      }

      router.push("/products");
      router.refresh();
    } catch (err: any) {
      alert("❌ Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Add New Saree" />
        
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1000px] mx-auto w-full">
          <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
            
            {/* Header Form Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white/40 border border-[#4A154B]/10 rounded-xl p-4 gap-4 backdrop-blur-md">
              <div className="flex items-center justify-between sm:justify-start gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#4A154B]/60">Save Status:</span>
                <select 
                  value={status} 
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="bg-white border border-[#4A154B]/20 text-[#4A154B] rounded px-2.5 py-1 text-xs font-semibold focus:outline-none"
                >
                  <option value="DRAFT">Draft Listing</option>
                  <option value="ACTIVE">Active (Publish Live)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex items-center gap-1.5 py-2 px-6 text-xs uppercase tracking-wider font-semibold shadow-md"
              >
                <Save size={14} />
                {loading ? "Publishing Saree..." : "Save Product"}
              </button>
            </div>

            {/* Core Saree Details Card */}
            <div className="ui-card p-6 sm:p-8 space-y-6">
              <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                <Bookmark size={16} />
                Saree Descriptions
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Title */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Saree Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Handwoven Pure Banarasi Katan Silk Saree"
                    className="glass-input"
                  />
                </div>

                {/* SKU (Auto Generated Display) */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center gap-1">
                    <Tag size={12} className="text-[#D4AF37]" />
                    SKU Code (Auto)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={sku}
                    className="glass-input text-center font-mono font-bold bg-[#FAF8F5]/80 text-[#4A154B] border-[#4A154B]/20 select-all"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Product Description</label>
                <textarea
                  rows={4}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter detailed description about the weave, pallu work, borders, and general drape feel..."
                  className="glass-input resize-none"
                />
              </div>
            </div>

            {/* Financials & Stock Matrix */}
            <div className="ui-card p-6 sm:p-8 space-y-6">
              <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                <DollarSign size={16} />
                Financials &amp; Stock levels
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                {/* Retail Price */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Selling Price (INR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-xs font-bold text-[#1A1A1A]/50">₹</span>
                    <input
                      type="number"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="18000"
                      className="glass-input pl-6 w-full"
                    />
                  </div>
                </div>

                {/* Compare at Price */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Compare-at Price (INR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-xs font-bold text-[#1A1A1A]/50">₹</span>
                    <input
                      type="number"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      placeholder="25000"
                      className="glass-input pl-6 w-full"
                    />
                  </div>
                </div>

                {/* Cost Price */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Private Cost Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-xs font-bold text-[#1A1A1A]/50">₹</span>
                    <input
                      type="number"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      placeholder="10000"
                      className="glass-input pl-6 w-full"
                    />
                  </div>
                </div>

                {/* Stock Quantity */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Stock Quantity</label>
                  <input
                    type="number"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="1"
                    className="glass-input text-center font-bold"
                  />
                </div>

                {/* Margin feedback */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center gap-1">
                    <Percent size={12} />
                    Profit Margin
                  </label>
                  <div className={`rounded-lg border p-2.5 text-center font-bold text-sm ${getMarginColor()}`}>
                    {priceVal > 0 ? `${profitMargin.toFixed(0)}% Margin` : "Pending Prices"}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Saree Specifications Metafields */}
            <div className="ui-card p-6 sm:p-8 space-y-6">
              <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                <Layers size={16} />
                Saree Specifications (metafields)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {/* Region */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center gap-1">
                    Region of Origin
                    <span className="text-[10px] text-[#1A1A1A]/40 font-normal lowercase">(Optional)</span>
                  </label>
                  <select value={region} onChange={(e) => setRegion(e.target.value)} className="glass-input bg-white">
                    <option value="">None Selected</option>
                    {regionOptions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {region === "Other" && (
                    <input
                      type="text"
                      required
                      value={customRegion}
                      onChange={(e) => setCustomRegion(e.target.value)}
                      placeholder="Type custom region..."
                      className="glass-input mt-1.5 focus:border-[#4A154B] text-xs"
                    />
                  )}
                </div>

                {/* Color Family */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center gap-1">
                    Color Family
                    <span className="text-[10px] text-red-500 font-bold">* Required</span>
                  </label>
                  <select value={colorFamily} onChange={(e) => setColorFamily(e.target.value)} className="glass-input bg-white border-red-500/20">
                    <option value="">None Selected</option>
                    {colorFamilyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {colorFamily === "Other" && (
                    <input
                      type="text"
                      required
                      value={customColorFamily}
                      onChange={(e) => setCustomColorFamily(e.target.value)}
                      placeholder="Type custom color..."
                      className="glass-input mt-1.5 focus:border-[#4A154B] text-xs"
                    />
                  )}
                </div>

                {/* Fabric */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center gap-1">
                    Fabric Type
                    <span className="text-[10px] text-red-500 font-bold">* Required</span>
                  </label>
                  <select value={fabric} onChange={(e) => setFabric(e.target.value)} className="glass-input bg-white border-red-500/20">
                    <option value="">None Selected</option>
                    {fabricOptions.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  {fabric === "Other" && (
                    <input
                      type="text"
                      required
                      value={customFabric}
                      onChange={(e) => setCustomFabric(e.target.value)}
                      placeholder="Type custom fabric..."
                      className="glass-input mt-1.5 focus:border-[#4A154B] text-xs"
                    />
                  )}
                </div>

                {/* Weave */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center gap-1">
                    Weave Style
                    <span className="text-[10px] text-[#1A1A1A]/40 font-normal lowercase">(Optional)</span>
                  </label>
                  <select value={weave} onChange={(e) => setWeave(e.target.value)} className="glass-input bg-white">
                    <option value="">None Selected</option>
                    {weaveOptions.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                  {weave === "Other" && (
                    <input
                      type="text"
                      required
                      value={customWeave}
                      onChange={(e) => setCustomWeave(e.target.value)}
                      placeholder="Type custom weave..."
                      className="glass-input mt-1.5 focus:border-[#4A154B] text-xs"
                    />
                  )}
                </div>

                {/* Occasion */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center gap-1">
                    Occasion Curation
                    <span className="text-[10px] text-red-500 font-bold">* Required</span>
                  </label>
                  <select value={occasion} onChange={(e) => setOccasion(e.target.value)} className="glass-input bg-white border-red-500/20">
                    <option value="">None Selected</option>
                    {occasionOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {occasion === "Other" && (
                    <input
                      type="text"
                      required
                      value={customOccasion}
                      onChange={(e) => setCustomOccasion(e.target.value)}
                      placeholder="Type custom occasion..."
                      className="glass-input mt-1.5 focus:border-[#4A154B] text-xs"
                    />
                  )}
                </div>

                {/* Blouse Included */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Blouse Piece Included?</label>
                  <select 
                    value={blouseIncluded ? "yes" : "no"} 
                    onChange={(e) => setBlouseIncluded(e.target.value === "yes")} 
                    className="glass-input bg-white font-semibold"
                  >
                    <option value="yes">Yes, Blouse Included</option>
                    <option value="no">No Blouse Piece</option>
                  </select>
                </div>

                {/* Blouse Length */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Blouse Length</label>
                  <input 
                    type="text" 
                    value={blouseIncluded ? blouseLength : "N/A"} 
                    onChange={(e) => setBlouseLength(e.target.value)} 
                    disabled={!blouseIncluded}
                    className={`glass-input ${!blouseIncluded ? "bg-[#1A1A1A]/5 text-[#1A1A1A]/40 cursor-not-allowed border-[#1A1A1A]/10 font-semibold" : ""}`} 
                  />
                </div>

                {/* Saree Length */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Saree Length (meters) *</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0.1" 
                    value={sareeLength} 
                    onChange={(e) => setSareeLength(e.target.value)} 
                    required 
                    className="glass-input font-semibold" 
                  />
                </div>

                {/* Wash Care */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Wash Care</label>
                  <textarea
                    value={washCare}
                    onChange={(e) => setWashCare(e.target.value)}
                    rows={3}
                    className="glass-input resize-none"
                    placeholder="e.g. Dry clean preferred. Do not machine wash..."
                  />
                </div>

                {/* Tag insertion */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Storefront Tags</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newTag} 
                      onChange={(e) => setNewTag(e.target.value)} 
                      placeholder="e.g. Zari"
                      className="glass-input flex-1 py-1 px-2 text-xs" 
                    />
                    <button type="button" onClick={addTag} className="btn-secondary py-1.5 px-3 flex items-center justify-center">
                      <Plus size={14} />
                    </button>
                  </div>
                  {existingTags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-[#1A1A1A]/50 font-bold uppercase">Quick Add:</span>
                      {existingTags.map(tagSuggestion => (
                        <button
                          key={tagSuggestion}
                          type="button"
                          onClick={() => {
                            if (tags.length >= 3) {
                              alert("❌ You can add a maximum of 3 tags to a particular Saree.");
                              return;
                            }
                            if (!tags.includes(tagSuggestion)) {
                              setTags([...tags, tagSuggestion]);
                            }
                          }}
                          className="bg-[#4A154B]/5 hover:bg-[#4A154B]/10 border border-[#4A154B]/10 rounded-full px-2.5 py-0.5 text-[10px] text-[#4A154B] font-semibold transition cursor-pointer"
                        >
                          + {tagSuggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tag display row */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {tags.map(t => (
                    <span key={t} className="flex items-center gap-1.5 bg-[#4A154B]/5 border border-[#4A154B]/10 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#4A154B]">
                      {t}
                      <button type="button" onClick={() => removeTag(t)} className="text-red-500 hover:text-red-700 font-bold focus:outline-none">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Media Uploaders (Video & Images) */}
            <div className="ui-card p-6 sm:p-8 space-y-6">
              <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                <ImageIcon size={16} />
                Cloud media assets
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Image upload */}
                <div>
                  <div className="border border-dashed border-[#4A154B]/15 rounded-2xl p-6 flex flex-col items-center justify-center bg-[#FAF8F5]/30 relative text-center min-h-[220px]">
                    <ImageIcon size={32} className="text-[#4A154B]/40 mb-3" />
                    <span className="text-xs font-bold text-[#4A154B]">Upload Saree Photos</span>
                    <span className="text-[10px] text-[#1A1A1A]/40 mt-1 mb-4 leading-relaxed">
                      <strong>Recommended:</strong> JPEG, PNG, or WebP<br />
                      <strong>Dimensions:</strong> 2:3 Vertical Ratio (e.g., 1000 x 1500 px)<br />
                      <strong>File Size:</strong> Under 5 MB per photo
                    </span>
                    
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      disabled={uploadingImage}
                    />
                    
                    {uploadingImage && <div className="text-xs text-[#4A154B] font-semibold animate-pulse">Uploading Saree Photo...</div>}
                  </div>

                  {/* Previews of uploaded images */}
                  {images.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 w-full mt-4">
                      {images.map((img, index) => {
                        const status = mediaStatuses[img.id]?.status || "ready";
                        const isSyncing = status === "queued" || status === "processing";
                        const isFailed = status === "failed";
                        return (
                          <div key={img.id || index} className="relative aspect-[2/3] rounded-lg overflow-hidden border border-[#4A154B]/10 bg-[#FAF8F5]">
                            <img src={img.url} alt={`Uploaded ${index + 1}`} className="object-cover w-full h-full" />
                            {isSyncing && (
                              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center p-2">
                                <span className="text-[10px] font-bold text-white uppercase animate-pulse">Syncing...</span>
                                <span className="text-[9px] text-white/80 mt-0.5">{status === "queued" ? "Queued" : "Optimizing"}</span>
                              </div>
                            )}
                            {isFailed && (
                              <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center text-center p-2 text-white">
                                <span className="text-[10px] font-bold uppercase">Failed</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setImages(prev => prev.filter((_, i) => i !== index))}
                              className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md cursor-pointer z-10"
                              aria-label="Remove image"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Video upload */}
                <div>
                  <div className="border border-dashed border-[#4A154B]/15 rounded-2xl p-6 flex flex-col items-center justify-center bg-[#FAF8F5]/30 relative text-center min-h-[220px]">
                    <VideoIcon size={32} className="text-[#D4AF37]/60 mb-3" />
                    <span className="text-xs font-bold text-[#4A154B]">Upload Short Video (Optional)</span>
                    <span className="text-[10px] text-[#1A1A1A]/40 mt-1 mb-4 leading-relaxed">
                      <strong>Format:</strong> MP4 (H.264 codec)<br />
                      <strong>Length:</strong> 5 - 15 seconds (Muted/No audio)<br />
                      <strong>Aspect Ratio:</strong> Vertical 9:16 or 2:3 (e.g., 1080 x 1920 px)<br />
                      <strong>File Size:</strong> Under 100 MB (expanded)
                    </span>
                    
                    <input 
                       type="file" 
                       accept="video/mp4" 
                       onChange={handleVideoUpload} 
                       className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                       disabled={uploadingVideo}
                    />

                    {uploadingVideo && <div className="text-xs text-[#4A154B] font-semibold animate-pulse">Uploading Looping Video...</div>}
                  </div>

                  {/* Video preview */}
                  {video && (
                    <div className="mt-4 flex flex-col items-center">
                      <div className="relative aspect-[9/16] w-[140px] rounded-lg overflow-hidden border border-[#4A154B]/10 bg-[#FAF8F5] shadow-sm">
                        <video src={video.url} controls muted loop playsInline className="object-cover w-full h-full" />
                        {(() => {
                          const status = mediaStatuses[video.id]?.status || "ready";
                          const isSyncing = status === "queued" || status === "processing";
                          const isFailed = status === "failed";
                          if (isSyncing) {
                            return (
                              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center p-2">
                                <span className="text-[11px] font-bold text-white uppercase animate-pulse">Worker Syncing...</span>
                                <span className="text-[10px] text-white/80 mt-0.5">{status === "queued" ? "Queued in Redis" : "Optimizing Bitrates"}</span>
                              </div>
                            );
                          }
                          if (isFailed) {
                            return (
                              <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center text-center p-2 text-white">
                                <span className="text-[11px] font-bold uppercase">Sync Failed</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        <button
                          type="button"
                          onClick={() => {
                            setVideo(null);
                            setFoundersExclusive(false);
                          }}
                          className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md cursor-pointer z-10"
                          aria-label="Remove video"
                        >
                          ×
                        </button>
                      </div>
                      <div className="text-[11px] text-green-600 font-semibold mt-2 flex items-center gap-1">
                        ✓ Looping Video Attached Successfully!
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Founder Curation & Cost Logs */}
            <div className="ui-card p-6 sm:p-8 space-y-6">
              <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                <Sparkles size={16} className="text-[#D4AF37]" />
                Founder curation options
              </h3>

              {/* Founder's Exclusive Toggle */}
              <div className="flex items-center gap-4 bg-[#D4AF37]/5 border border-[#D4AF37]/20 p-4 rounded-xl">
                <input
                  type="checkbox"
                  id="foundersExclusive"
                  disabled={!video}
                  checked={foundersExclusive}
                  onChange={(e) => setFoundersExclusive(e.target.checked)}
                  className="w-5 h-5 accent-[#4A154B] rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <div>
                  <label htmlFor="foundersExclusive" className="text-sm font-bold text-[#4A154B] cursor-pointer flex items-center gap-1">
                    Mark as "Founder's Exclusive" Curation {!video && <span className="text-[10px] text-red-500 font-normal ml-2">(Requires Video Upload)</span>}
                  </label>
                  <p className="text-xs text-[#1A1A1A]/60 mt-0.5">
                    Ticking this adds the `Founders-Exclusive` tag and automatically groups this product into the exclusive curation rows on your storefront!
                  </p>
                </div>
              </div>

              {/* Private Notes */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Private Admin Notes (Redis Only)</label>
                <textarea
                  rows={2}
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  placeholder="Enter private margins, weaver contact details, raw silk procurement notes. Totally hidden from customers..."
                  className="glass-input resize-none"
                />
              </div>
            </div>

            {/* Footer Form Submissions */}
            <div className="flex flex-col items-end gap-3 p-4 w-full">
              {isMediaSyncing && (
                <div className="bg-[#fffbeb] border border-[#f59e0b]/30 text-[#92400e] text-xs p-3.5 rounded-xl flex items-center gap-2 animate-pulse w-full justify-center">
                  <span className="text-sm">⚠️</span>
                  <span>
                    <strong>Media Worker:</strong> Optimizing and syncing high-definition video/image assets to Shopify CDN. Please wait for completion before saving to prevent broken media links.
                  </span>
                </div>
              )}
              <button
                type="submit"
                disabled={loading || uploadingImage || uploadingVideo || isMediaSyncing}
                className={`btn-primary py-3 px-8 text-xs uppercase tracking-wider font-semibold shadow-md flex items-center gap-1.5 ${(loading || uploadingImage || uploadingVideo || isMediaSyncing) ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <Save size={14} />
                {loading ? "Publishing Saree..." : 
                 uploadingImage ? "Uploading Saree Photo..." :
                 uploadingVideo ? "Uploading Looping Video..." :
                 isMediaSyncing ? "Worker Syncing Media..." : "Save Product"}
              </button>
            </div>

          </form>
        </main>
      </div>
    </div>
  );
}
