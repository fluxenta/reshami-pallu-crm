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
  Bookmark,
  ArrowRight,
  ArrowLeft,
  Info
} from "lucide-react";

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

const COLOR_SWATCHES: Record<string, string> = {
  "Red": "#E11D48",
  "Blue": "#2563EB",
  "Green": "#16A34A",
  "Gold": "#D4AF37",
  "Silver": "#CBD5E1",
  "Pink": "#EC4899",
  "White": "#FFFFFF",
  "Black": "#1E293B",
  "Maroon": "#800000",
  "Purple": "#7C3AED",
  "Cream": "#FDF6E2",
  "Orange": "#EA580C",
  "Yellow": "#FACC15",
  "Turquoise": "#0D9488"
};

export default function AddProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skuNumber, setSkuNumber] = useState(1);
  const [step, setStep] = useState(1);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT">("ACTIVE");
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

  // AI Saree Studio State
  const [aiLoading, setAiLoading] = useState(false);
  const [modelTone, setModelTone] = useState("Olive Indian skin tone");
  const [backgroundVibe, setBackgroundVibe] = useState("minimalist modern light-filled studio, terracotta planters, soft shadows");
  const [customAiPrompt, setCustomAiPrompt] = useState("");
  const [displayMode, setDisplayMode] = useState<"both" | "model_only">("both");
  const [generationCount, setGenerationCount] = useState(1);
  const [selectedPoses, setSelectedPoses] = useState<string[]>(["Front Pleats Detail"]);

  const togglePose = (pose: string) => {
    if (selectedPoses.includes(pose)) {
      if (selectedPoses.length > 1) {
        setSelectedPoses(selectedPoses.filter(p => p !== pose));
      }
    } else {
      if (selectedPoses.length < generationCount) {
        setSelectedPoses([...selectedPoses, pose]);
      } else if (generationCount < 4) {
        const newCount = generationCount + 1;
        setGenerationCount(newCount);
        setSelectedPoses([...selectedPoses, pose]);
      } else {
        setSelectedPoses([...selectedPoses.slice(1), pose]);
      }
    }
  };

  const handleGenerationCountChange = (count: number) => {
    setGenerationCount(count);
    if (selectedPoses.length > count) {
      setSelectedPoses(selectedPoses.slice(0, count));
    }
  };

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
  const [selectedColors, setSelectedColors] = useState<string[]>(["Red"]);
  const [occasion, setOccasion] = useState("");
  const [blouseIncluded, setBlouseIncluded] = useState(true);
  const [blouseLength, setBlouseLength] = useState("0.8 meters");
  const [sareeLength, setSareeLength] = useState("6.0");
  const [washCare, setWashCare] = useState("");
  const [foundersExclusive, setFoundersExclusive] = useState(false);
  const [privateNotes, setPrivateNotes] = useState("");

  // Dynamic Options lists loaded from Upstash Redis
  const [customFabrics, setCustomFabrics] = useState<string[]>([]);
  const [customWeaves, setCustomWeaves] = useState<string[]>([]);
  const [customOccasions, setCustomOccasions] = useState<string[]>([]);
  const [customColorFamilies, setCustomColorFamilies] = useState<string[]>([]);

  // Text inputs for "Other" custom typed selections
  const [customFabric, setCustomFabric] = useState("");
  const [customWeave, setCustomWeave] = useState("");
  const [customOccasion, setCustomOccasion] = useState("");
  const [customColorFamily, setCustomColorFamily] = useState("");
  const [showCustomColor, setShowCustomColor] = useState(false);

  // Dynamic selector options
  const colorFamilyOptions = Array.from(new Set([
    "Red", "Blue", "Green", "Gold", "Silver", "Pink", "White", "Black", "Maroon", "Purple", "Cream", "Orange", "Yellow", "Turquoise", 
    ...customColorFamilies
  ])).filter(Boolean) as string[];
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
    setSku(`RP-INV-${skuNumber}`);
  }, [skuNumber]);

  // Fetch stock counts to auto-increment SKU numbers
  useEffect(() => {
    const fetchLatestNumber = async () => {
      try {
        const res = await fetch("/api/products/sku-count?color=INV");
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
  }, []);

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

  // Validation State variables
  const isStep1Valid = 
    title.trim() !== "" && 
    selectedColors.length > 0 && 
    fabric !== "" && 
    occasion !== "" &&
    (fabric !== "Other" || customFabric.trim() !== "") &&
    (weave !== "Other" || customWeave.trim() !== "") &&
    (occasion !== "Other" || customOccasion.trim() !== "");

  const isStep2Valid = true; // Media uploading is optional for validation

  const isStep3Valid = 
    price.trim() !== "" && 
    stock.trim() !== "";

  // Helper required badge renderer
  const renderRequiredBadge = () => (
    <span className="text-[9px] uppercase tracking-wider font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md border border-red-200 ml-1.5 select-none">
      Required
    </span>
  );

  // Dynamic Checklist Widget for Step 1
  const renderStep1Checklist = () => {
    return (
      <div className="hidden lg:flex items-center gap-3 text-[10px] font-bold text-[#1A1A1A]/60 bg-white/40 border border-[#4A154B]/5 rounded-xl px-3 py-1.5 backdrop-blur-sm shadow-inner select-none">
        <span className="text-[#4A154B]/60 uppercase tracking-wider border-r border-[#4A154B]/10 pr-2.5">Progress Checklist:</span>
        <span className={`flex items-center gap-1 transition-colors ${title.trim() !== "" ? "text-green-600 font-bold" : "text-[#1A1A1A]/40"}`}>
          <span className="inline-block text-xs">{title.trim() !== "" ? "✓" : "○"}</span> Title
        </span>
        <span className={`flex items-center gap-1 transition-colors ${selectedColors.length > 0 ? "text-green-600 font-bold" : "text-[#1A1A1A]/40"}`}>
          <span className="inline-block text-xs">{selectedColors.length > 0 ? "✓" : "○"}</span> Color
        </span>
        <span className={`flex items-center gap-1 transition-colors ${fabric !== "" ? "text-green-600 font-bold" : "text-[#1A1A1A]/40"}`}>
          <span className="inline-block text-xs">{fabric !== "" ? "✓" : "○"}</span> Fabric
        </span>
        <span className={`flex items-center gap-1 transition-colors ${occasion !== "" ? "text-green-600 font-bold" : "text-[#1A1A1A]/40"}`}>
          <span className="inline-block text-xs">{occasion !== "" ? "✓" : "○"}</span> Occasion
        </span>
      </div>
    );
  };

  // Image Upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        setImages(prev => {
          if (prev.some(img => img.id === data.id)) return prev;
          return [...prev, data];
        });
        setMediaStatuses(prev => ({ ...prev, [data.id]: { status: "queued" } }));
      } catch (err) {
        alert("Image upload failed: " + (err as Error).message);
      }
    }
    
    setUploadingImage(false);
  };

  // AI Saree Studio Generation handler
  const handleAiGeneration = async () => {
    const rawSareeImages = images.filter(img => !img.id.startsWith("media_ai_"));

    if (rawSareeImages.length === 0) {
      alert("❌ Please upload at least one raw saree image first to use as a source.");
      return;
    }

    if (selectedPoses.length === 0) {
      alert("❌ Please select at least one pose for generation.");
      return;
    }

    setAiLoading(true);

    try {
      const res = await fetch("/api/admin/generate-shoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaIds: rawSareeImages.map(img => img.id),
          modelTone,
          backgroundVibe,
          customPrompt: customAiPrompt,
          poses: selectedPoses
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "AI shoot generation failed");
      }

      const data = await res.json();
      
      if (data.items && Array.isArray(data.items)) {
        setImages(prev => [...prev, ...data.items]);
        setMediaStatuses(prev => {
          const next = { ...prev };
          data.items.forEach((item: any) => {
            next[item.id] = { status: "queued" };
          });
          return next;
        });
      }
      
      if (data.description && !customAiPrompt) {
        setCustomAiPrompt(data.description);
      }
      
      alert(`🌟 AI Model Shoot completed! ${data.items?.length || 1} generated image(s) have been added to your gallery and are optimization-syncing to Shopify in the background.`);
    } catch (err: any) {
      alert("❌ AI Generation failed: " + err.message);
    } finally {
      setAiLoading(false);
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

    const finalFabric = fabric === "Other" ? customFabric.trim() : fabric;
    const finalWeave = weave === "Other" ? customWeave.trim() : weave;
    const finalOccasion = occasion === "Other" ? customOccasion.trim() : occasion;
    let finalColors = [...selectedColors];
    if (showCustomColor && customColorFamily.trim()) {
      if (!finalColors.includes(customColorFamily.trim())) {
        finalColors.push(customColorFamily.trim());
      }
    }
    const finalColorFamily = finalColors.join(", ");

    // Check mandatory fields
    if (!finalColorFamily) {
      alert("❌ Error: Colour is mandatory. Please select a color.");
      setStep(1); // Return to Step 1 where color is located
      setLoading(false);
      return;
    }
    if (!finalFabric) {
      alert("❌ Error: Fabric Type is mandatory. Please select a fabric.");
      setStep(1); // Return to Step 1 where fabric is located
      setLoading(false);
      return;
    }
    if (!finalOccasion) {
      alert("❌ Error: Occasion Curation is mandatory. Please select an occasion.");
      setStep(1);
      setLoading(false);
      return;
    }

    try {
      // 1. Save new custom options to Upstash Redis
      const savePromises = [];
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
      if (showCustomColor && customColorFamily.trim()) {
        savePromises.push(fetch("/api/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "colorFamilies", value: finalColorFamily })
        }));
      }

      if (savePromises.length > 0) {
        await Promise.all(savePromises);
      }

      // Filter images based on selected storefront display mode
      const finalImages = displayMode === "model_only"
        ? images.filter(img => img.id.startsWith("media_ai_"))
        : images;

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
        images: finalImages,
        metafields: {
          fabric: finalFabric,
          weave: finalWeave,
          colorFamily: finalColorFamily,
          occasion: finalOccasion,
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

  const fillDemoData = () => {
    setTitle("Heritage Handwoven Kanjeevaram Silk Saree");
    setDescription("Meticulously hand-loomed from high-grade mulberry silk, this Kanjeevaram masterpiece exhibits a vibrant crimson body detailed with microscopic gold checks. A sweeping border of pure zari depicting sacred motifs frames this drape, complete with a heavily embellished pallu representing fine Indian heritage.");
    setPrice("19500");
    setCompareAtPrice("25000");
    setCostPrice("9500");
    setStock("5");
    setSelectedColors(["Red", "Gold"]);
    setFabric("Pure Silk");
    setWeave("Kadhua");
    setOccasion("Bridal");
    setBlouseIncluded(true);
    setBlouseLength("0.8 meters");
    setSareeLength("6.0");
    setWashCare("Dry clean only. Wrap wrapped inside muslin cloth and store away from damp/sunlight.");
    
    // Jump to step 2 to upload files immediately
    setStep(2);
  };

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Create a Saree Listing" />
        
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1000px] mx-auto w-full">
          
          {/* New Glowing Stepped Progress Bar */}
          <div className="max-w-3xl mx-auto mb-10 relative px-4">
            {/* Connecting Track Line */}
            <div className="absolute top-5 left-8 right-8 h-0.5 bg-[#4A154B]/10 -translate-y-1/2 z-0" />
            <div 
              className="absolute top-5 left-8 h-0.5 bg-gradient-to-r from-[#4A154B] to-[#D4AF37] -translate-y-1/2 z-0 transition-all duration-500 ease-in-out" 
              style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }}
            />

            <div className="flex justify-between relative z-10">
              {/* Step 1 */}
              <button 
                type="button" 
                onClick={() => setStep(1)} 
                className="flex flex-col items-center gap-2 group cursor-pointer focus:outline-none"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-sm !cursor-pointer ${
                  step >= 1 
                    ? "bg-[#4A154B] text-white ring-4 ring-[#4A154B]/10" 
                    : "bg-white text-[#1A1A1A]/40 border border-[#4A154B]/20"
                }`}>
                  1
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors duration-300 ${
                  step === 1 ? "text-[#4A154B]" : "text-[#1A1A1A]/40"
                }`}>
                  1. Story &amp; Weave
                </span>
              </button>

              {/* Step 2 */}
              <button 
                type="button" 
                onClick={() => {
                  if (isStep1Valid) setStep(2);
                }} 
                disabled={!isStep1Valid}
                className={`flex flex-col items-center gap-2 group focus:outline-none ${!isStep1Valid ? "opacity-50 !cursor-not-allowed" : "!cursor-pointer"}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-sm ${
                  step >= 2 
                    ? "bg-[#4A154B] text-white ring-4 ring-[#4A154B]/10" 
                    : "bg-white text-[#1A1A1A]/40 border border-[#4A154B]/20"
                }`}>
                  2
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors duration-300 ${
                  step === 2 ? "text-[#4A154B]" : "text-[#1A1A1A]/40"
                }`}>
                  2. Media Assets
                </span>
              </button>

              {/* Step 3 */}
              <button 
                type="button" 
                onClick={() => {
                  if (isStep1Valid && isStep2Valid) setStep(3);
                }} 
                disabled={!isStep1Valid}
                className={`flex flex-col items-center gap-2 group focus:outline-none ${!isStep1Valid ? "opacity-50 !cursor-not-allowed" : "!cursor-pointer"}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-sm ${
                  step >= 3 
                    ? "bg-[#4A154B] text-white ring-4 ring-[#4A154B]/10" 
                    : "bg-white text-[#1A1A1A]/40 border border-[#4A154B]/20"
                }`}>
                  3
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors duration-300 ${
                  step === 3 ? "text-[#4A154B]" : "text-[#1A1A1A]/40"
                }`}>
                  3. Price &amp; Curation
                </span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Persistant Top Bar Redesigned with Next Step and Back Button */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white/50 border border-[#4A154B]/10 rounded-2xl p-4 gap-4 backdrop-blur-md">
              <div className="flex items-center gap-2 border border-green-200 bg-green-50 px-2.5 py-1 rounded-md text-[10px] font-bold text-green-700 uppercase tracking-wider select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>Auto-Publish Enabled (Live)</span>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Render active progress checklist widget in step 1 */}
                {step === 1 && renderStep1Checklist()}

                {/* Back button (top) */}
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(prev => prev - 1)}
                    className="btn-secondary flex items-center gap-1.5 py-2.5 px-4 text-xs uppercase tracking-wider font-bold !cursor-pointer"
                  >
                    <ArrowLeft size={12} />
                    Back
                  </button>
                )}

                {/* Next Step button (top) */}
                {step < 3 && (
                  <button
                    type="button"
                    onClick={() => setStep(prev => prev + 1)}
                    disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
                    className={`btn-primary flex items-center gap-1.5 py-2.5 px-5 text-xs uppercase tracking-wider font-bold shadow-md transition-all ${
                      (step === 1 ? !isStep1Valid : !isStep2Valid) 
                        ? "opacity-45 bg-[#FAF8F5] text-[#1A1A1A]/40 border-gray-300 shadow-none !cursor-not-allowed" 
                        : "!cursor-pointer"
                    }`}
                  >
                    Next Step
                    <ArrowRight size={12} />
                  </button>
                )}


                
                {/* Final save button */}
                {step === 3 && (
                  <button
                    type="submit"
                    disabled={loading || uploadingImage || uploadingVideo || isMediaSyncing || !isStep3Valid}
                    className={`btn-primary flex items-center gap-1.5 py-2.5 px-6 text-xs uppercase tracking-wider font-bold shadow-md transition-all ${
                      (!isStep3Valid || loading || uploadingImage || uploadingVideo || isMediaSyncing)
                        ? "opacity-45 bg-gray-200 text-gray-400 !cursor-not-allowed shadow-none border-gray-300"
                        : "!cursor-pointer"
                    }`}
                  >
                    <Save size={14} />
                    {loading ? "Publishing..." : "Save Product"}
                  </button>
                )}
              </div>
            </div>

            {/* STEP 1: Saree Aesthetics & Story */}
            {step === 1 && (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Visual Core Description */}
                <div className="ui-card p-6 sm:p-8 space-y-6">
                  <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                    <Bookmark size={18} className="text-[#D4AF37]" />
                    1. Saree Story &amp; Details
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Title */}
                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center">
                        Saree Title
                        {renderRequiredBadge()}
                      </label>
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
                        SKU Identifier (Auto-generated)
                      </label>
                      <input
                        type="text"
                        disabled
                        value={sku}
                        className="glass-input text-center font-mono font-bold bg-[#FAF8F5]/80 text-[#4A154B] border-[#4A154B]/20 select-all !cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">The Design Story (Product Description)</label>
                    <textarea
                      rows={5}
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Write a beautiful narrative about the weaving origin, pallu designs, border detailing, and draping grace..."
                      className="glass-input resize-none"
                    />
                  </div>
                </div>

                {/* Saree Weave Specifications - OVERHAULED TO MODERN GRID CARD SELECTORS */}
                <div className="ui-card p-6 sm:p-8 space-y-6">
                  <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                    <Layers size={18} className="text-[#D4AF37]" />
                    2. Weave Details &amp; Specifications
                  </h3>

                  <div className="space-y-6">
                    
                    {/* Fabric Type Grid Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center">
                        Fabric Material
                        {renderRequiredBadge()}
                      </label>
                      <div className="flex flex-wrap gap-2.5">
                        {fabricOptions.map((fOpt) => {
                          const isSelected = fabric === fOpt;
                          return (
                            <button
                              type="button"
                              key={fOpt}
                              onClick={() => setFabric(fOpt)}
                              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 border !cursor-pointer ${
                                isSelected 
                                  ? 'bg-[#4A154B] text-[#D4AF37] border-[#4A154B] shadow-md scale-102' 
                                  : 'bg-white text-soft-black border-soft-black/10 hover:border-soft-black/25'
                              }`}
                            >
                              {fOpt}
                            </button>
                          );
                        })}
                      </div>
                      {fabric === "Other" && (
                        <input
                          type="text"
                          required
                          value={customFabric}
                          onChange={(e) => setCustomFabric(e.target.value)}
                          placeholder="Type custom fabric material..."
                          className="glass-input mt-2.5 focus:border-[#4A154B] text-xs max-w-sm"
                        />
                      )}
                    </div>

                    {/* Occasion Curation Grid Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center">
                        Occasion Curation
                        {renderRequiredBadge()}
                      </label>
                      <div className="flex flex-wrap gap-2.5">
                        {occasionOptions.map((oOpt) => {
                          const isSelected = occasion === oOpt;
                          return (
                            <button
                              type="button"
                              key={oOpt}
                              onClick={() => setOccasion(oOpt)}
                              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 border !cursor-pointer ${
                                isSelected 
                                  ? 'bg-[#4A154B] text-[#D4AF37] border-[#4A154B] shadow-md scale-102' 
                                  : 'bg-white text-soft-black border-soft-black/10 hover:border-soft-black/25'
                              }`}
                            >
                              {oOpt}
                            </button>
                          );
                        })}
                      </div>
                      {occasion === "Other" && (
                        <input
                          type="text"
                          required
                          value={customOccasion}
                          onChange={(e) => setCustomOccasion(e.target.value)}
                          placeholder="Type custom occasion..."
                          className="glass-input mt-2.5 focus:border-[#4A154B] text-xs max-w-sm"
                        />
                      )}
                    </div>



                    {/* Weave Style Grid Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 block">
                        Weave Style
                      </label>
                      <div className="flex flex-wrap gap-2.5">
                        {weaveOptions.map((wOpt) => {
                          const isSelected = weave === wOpt;
                          return (
                            <button
                              type="button"
                              key={wOpt}
                              onClick={() => setWeave(wOpt)}
                              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 border !cursor-pointer ${
                                isSelected 
                                  ? 'bg-[#4A154B] text-[#D4AF37] border-[#4A154B] shadow-md scale-102' 
                                  : 'bg-white text-soft-black border-soft-black/10 hover:border-soft-black/25'
                              }`}
                            >
                              {wOpt}
                            </button>
                          );
                        })}
                      </div>
                      {weave === "Other" && (
                        <input
                          type="text"
                          required
                          value={customWeave}
                          onChange={(e) => setCustomWeave(e.target.value)}
                          placeholder="Type custom weave..."
                          className="glass-input mt-2.5 focus:border-[#4A154B] text-xs max-w-sm"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-4">
                      {/* Blouse Included */}
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Blouse Piece Attached?</label>
                        <select 
                          value={blouseIncluded ? "yes" : "no"} 
                          onChange={(e) => setBlouseIncluded(e.target.value === "yes")} 
                          className="glass-input bg-white font-semibold !cursor-pointer"
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
                          className={`glass-input ${!blouseIncluded ? "bg-[#1A1A1A]/5 text-[#1A1A1A]/40 !cursor-not-allowed border-[#1A1A1A]/10 font-semibold" : ""}`} 
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
                      <div className="flex flex-col gap-2 sm:col-span-2 md:col-span-3">
                        <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Fabric Wash &amp; Care Details</label>
                        <input
                          type="text"
                          value={washCare}
                          onChange={(e) => setWashCare(e.target.value)}
                          className="glass-input w-full"
                          placeholder="e.g. Dry clean only. Wrap in pure muslin cloth. Avoid hanging."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Color Family multi-pill selector - NOW INCLUDES BEAUTIFUL COLORED SWATCHES */}
                  <div className="flex flex-col gap-2 pt-6 border-t border-[#4A154B]/5">
                    <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center">
                      Color Families
                      {renderRequiredBadge()}
                      <span className="text-[10px] text-[#1A1A1A]/45 ml-1.5 lowercase font-normal">(Pick one or more)</span>
                    </label>
                    <div className="flex flex-wrap gap-2.5 mt-1">
                      {colorFamilyOptions.filter(c => c !== "Other").map(c => {
                        const isSelected = selectedColors.includes(c);
                        const swatchHex = COLOR_SWATCHES[c] || "#E2E8F0";
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                  setSelectedColors(prev => prev.filter(color => color !== c));
                              } else {
                                  setSelectedColors(prev => [...prev, c]);
                              }
                            }}
                            className={`px-4 py-2 rounded-2xl text-[11px] font-bold transition-all duration-200 border !cursor-pointer flex items-center gap-2 ${
                              isSelected 
                                ? 'bg-[#4A154B] text-[#D4AF37] border-[#4A154B] shadow-md scale-102' 
                                : 'bg-white text-soft-black border-soft-black/10 hover:border-soft-black/25'
                            }`}
                          >
                            <span 
                              className="w-3 h-3 rounded-full border border-black/10 inline-block shrink-0 shadow-inner" 
                              style={{ backgroundColor: swatchHex }}
                            />
                            {c}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setShowCustomColor(!showCustomColor)}
                        className={`px-4 py-2 rounded-2xl text-[11px] font-bold transition-colors border !cursor-pointer ${
                          showCustomColor 
                            ? 'bg-[#4A154B] text-white border-[#4A154B]' 
                            : 'bg-white text-soft-black border-dashed border-[#4A154B]/30 hover:border-[#4A154B]'
                        }`}
                      >
                        + Add Custom Color
                      </button>
                    </div>
                    {showCustomColor && (
                      <input
                        type="text"
                        required
                        value={customColorFamily}
                        onChange={(e) => setCustomColorFamily(e.target.value)}
                        placeholder="Type custom color..."
                        className="glass-input mt-2 focus:border-[#4A154B] text-xs max-w-sm"
                      />
                    )}
                  </div>
                </div>

                {/* Bottom Navigation next button */}
                <div className="flex justify-between items-center pt-4">
                  {/* render checklist also next to bottom buttons */}
                  {renderStep1Checklist()}
                  
                  <button
                    type="button"
                    onClick={() => {
                      if (isStep1Valid) setStep(2);
                    }}
                    disabled={!isStep1Valid}
                    className={`btn-primary py-3.5 px-10 text-xs uppercase tracking-wider font-bold flex items-center gap-2 shadow-md transition-all duration-300 ${
                      !isStep1Valid 
                        ? "opacity-45 bg-[#FAF8F5] text-[#1A1A1A]/40 border-gray-300 shadow-none !cursor-not-allowed" 
                        : "!cursor-pointer"
                    }`}
                  >
                    Next: Media Assets
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Media Assets */}
            {step === 2 && (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Cloud Media Assets */}
                <div className="ui-card p-6 sm:p-8 space-y-6">
                  <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                    <ImageIcon size={18} className="text-[#D4AF37]" />
                    1. Cloud Saree Media Assets
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Image upload block */}
                    <div className="space-y-4">
                      <div className="border border-dashed border-[#4A154B]/20 hover:border-[#4A154B]/50 rounded-3xl p-6 flex flex-col items-center justify-center bg-[#FAF8F5]/30 relative text-center min-h-[220px] transition-colors duration-300 !cursor-pointer">
                        <ImageIcon size={36} className="text-[#4A154B]/40 mb-3" />
                        <span className="text-xs font-bold text-[#4A154B]">Upload Saree Photographs</span>
                        <span className="text-[10px] text-[#1A1A1A]/40 mt-1.5 mb-4 leading-relaxed">
                          <strong>Format:</strong> JPEG, PNG, or WebP (Flat-lay or Mannequin)<br />
                          <strong>Ratio:</strong> 2:3 or 3:4 Vertical portrait scale<br />
                          <strong>Size:</strong> Under 5 MB per photo file
                        </span>
                        
                        <input 
                          type="file" 
                          multiple
                          accept="image/*" 
                          onChange={handleImageUpload} 
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          disabled={uploadingImage}
                        />
                        
                        {uploadingImage && <div className="text-xs text-[#4A154B] font-bold animate-pulse">Uploading photos...</div>}
                      </div>

                      {/* Photo Previews */}
                      {images.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-[#1A1A1A]/60 block">Saree Image Gallery ({images.length})</label>
                          <div className="grid grid-cols-3 gap-3 w-full">
                            {images.map((img, index) => {
                              const status = mediaStatuses[img.id]?.status || "ready";
                              const isSyncing = status === "queued" || status === "processing";
                              const isFailed = status === "failed";
                              return (
                                <div key={img.id || index} className="relative aspect-[2/3] rounded-2xl overflow-hidden border border-[#4A154B]/10 bg-white shadow-sm group">
                                  <img src={img.url} alt={`Uploaded ${index + 1}`} className="object-cover w-full h-full" />
                                  {isSyncing && (
                                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center p-2">
                                      <span className="text-[9px] font-bold text-white uppercase animate-pulse">Syncing...</span>
                                    </div>
                                  )}
                                  {isFailed && (
                                    <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center text-center p-2 text-white">
                                      <span className="text-[9px] font-bold uppercase">Failed</span>
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
                        </div>
                      )}
                    </div>

                    {/* Video upload block */}
                    <div className="space-y-4">
                      <div className="border border-dashed border-[#4A154B]/20 hover:border-[#4A154B]/50 rounded-3xl p-6 flex flex-col items-center justify-center bg-[#FAF8F5]/30 relative text-center min-h-[220px] transition-colors duration-300 !cursor-pointer">
                        <VideoIcon size={36} className="text-[#D4AF37]/50 mb-3" />
                        <span className="text-xs font-bold text-[#4A154B]">Upload short video (Optional)</span>
                        <span className="text-[10px] text-[#1A1A1A]/40 mt-1.5 mb-4 leading-relaxed">
                          <strong>Format:</strong> Vertical MP4 (Muted loop)<br />
                          <strong>Length:</strong> 5 to 15 seconds looping<br />
                          <strong>Exclusive:</strong> Marks Saree as Founder Curation<br />
                          <strong>Size:</strong> Under 100 MB file limit
                        </span>
                        
                        <input 
                           type="file" 
                           accept="video/mp4" 
                           onChange={handleVideoUpload} 
                           className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                           disabled={uploadingVideo}
                        />

                        {uploadingVideo && <div className="text-xs text-[#4A154B] font-bold animate-pulse">Uploading video...</div>}
                      </div>

                      {/* Video Preview */}
                      {video && (
                        <div className="flex flex-col items-center p-3 rounded-2xl bg-white border border-[#4A154B]/10 max-w-[160px] mx-auto relative group">
                          <div className="relative aspect-[9/16] w-[120px] rounded-xl overflow-hidden bg-[#FAF8F5] shadow-inner">
                            <video src={video.url} controls muted loop playsInline className="object-cover w-full h-full" />
                            {(() => {
                              const status = mediaStatuses[video.id]?.status || "ready";
                              const isSyncing = status === "queued" || status === "processing";
                              const isFailed = status === "failed";
                              if (isSyncing) {
                                return (
                                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center p-1.5 text-white">
                                    <span className="text-[8px] font-bold uppercase animate-pulse">Syncing...</span>
                                  </div>
                                );
                              }
                              if (isFailed) {
                                return (
                                  <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center text-center p-1.5 text-white">
                                    <span className="text-[8px] font-bold uppercase">Failed</span>
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
                              className="absolute top-1 right-1 bg-red-500 hover:bg-red-700 text-white rounded-full w-4.5 h-4.5 flex items-center justify-center text-[9px] font-bold shadow-md cursor-pointer z-10"
                              aria-label="Remove video"
                            >
                              ×
                            </button>
                          </div>
                          <span className="text-[9px] text-green-600 font-bold mt-2">✓ Video Connected</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>



                {/* Back / Next Buttons */}
                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="btn-secondary py-3 px-6 text-xs uppercase tracking-wider font-bold flex items-center gap-2 !cursor-pointer"
                  >
                    <ArrowLeft size={14} />
                    Back: Saree Story
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    disabled={!isStep2Valid}
                    className={`btn-primary py-3 px-8 text-xs uppercase tracking-wider font-bold flex items-center gap-2 shadow-md transition-all duration-300 ${
                      !isStep2Valid 
                        ? "opacity-45 bg-[#FAF8F5] text-[#1A1A1A]/40 border-gray-300 shadow-none !cursor-not-allowed" 
                        : "!cursor-pointer"
                    }`}
                  >
                    Next: Pricing &amp; Curation
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Pricing, Stock & Curation Options */}
            {step === 3 && (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Connected Saree Media Assets Quick-Summary bar */}
                {(images.length > 0 || video) && (
                  <div className="border border-[#4A154B]/10 bg-white/60 backdrop-blur-md rounded-3xl p-5 sm:p-6 space-y-3.5 shadow-sm animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-[#4A154B]/5 pb-2.5">
                      <div className="space-y-0.5">
                        <h4 className="font-display font-bold text-xs text-[#4A154B] flex items-center gap-1.5">
                          <ImageIcon size={14} className="text-[#D4AF37]" />
                          Connected Media Assets Checklist
                        </h4>
                        <p className="text-[10px] text-[#1A1A1A]/50">Verify photos and videos mapped to this Shopify listing before publishing.</p>
                      </div>
                      <span className="text-[9px] font-bold bg-[#4A154B]/5 text-[#4A154B] px-2 py-0.5 rounded-md border border-[#4A154B]/10">
                        {images.length} Photos {video ? "+ 1 Video" : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-3.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-[#4A154B]/10 scrollbar-track-transparent">
                      {/* Images */}
                      {images.map((img, index) => {
                        const status = mediaStatuses[img.id]?.status || "ready";
                        const isSyncing = status === "queued" || status === "processing";
                        return (
                          <div key={img.id || index} className="relative aspect-[2/3] w-20 rounded-xl overflow-hidden border border-[#4A154B]/10 bg-white flex-shrink-0 shadow-sm group">
                            <img src={img.url} alt={`Preview ${index + 1}`} className="object-cover w-full h-full" />
                            {isSyncing && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-center">
                                <span className="text-[8px] font-bold text-white uppercase animate-pulse">Sync...</span>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Video */}
                      {video && (
                        <div className="relative aspect-[9/16] w-[56px] rounded-xl overflow-hidden bg-[#FAF8F5] border border-[#4A154B]/10 flex-shrink-0 shadow-sm">
                          <video src={video.url} muted loop playsInline className="object-cover w-full h-full" />
                          <span className="absolute bottom-1 left-1 right-1 text-[8px] font-bold text-center bg-[#D4AF37] text-[#4A154B] px-1 py-0.5 rounded shadow-sm uppercase leading-none">
                            Video
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Financials & Stock card */}
                <div className="ui-card p-6 sm:p-8 space-y-6">
                  <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                    <DollarSign size={18} className="text-[#D4AF37]" />
                    1. Financial Pricing &amp; Stock levels
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                    {/* Retail Price */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center">
                        Selling Price (INR)
                        {renderRequiredBadge()}
                      </label>
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

                    {/* Compare-at Price */}
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
                        <span className="absolute left-3 top-3 text-[#1A1A1A]/50 text-xs font-bold">₹</span>
                        <input
                          type="number"
                          value={costPrice}
                          onChange={(e) => setCostPrice(e.target.value)}
                          placeholder="10000"
                          className="glass-input pl-6 w-full"
                        />
                      </div>
                    </div>

                    {/* Stock Level */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center">
                        Stock level count
                        {renderRequiredBadge()}
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={stock}
                        onChange={(e) => setStock(e.target.value)}
                        placeholder="1"
                        className="glass-input text-center font-bold"
                      />
                    </div>

                    {/* Margin Feedback */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 flex items-center gap-1">
                        <Percent size={12} />
                        Markup Margin
                      </label>
                      <div className={`rounded-xl border p-2.5 text-center font-bold text-xs ${getMarginColor()}`}>
                        {priceVal > 0 ? `${profitMargin.toFixed(0)}% Margin` : "Specify Prices"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Curation Tags & Labels */}
                <div className="ui-card p-6 sm:p-8 space-y-6">
                  <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                    <Tag size={18} className="text-[#D4AF37]" />
                    2. Curation Tags &amp; Storefront Tags
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Add Tags */}
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase text-[#1A1A1A]/70 block">Create and Attach Tags</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={newTag} 
                          onChange={(e) => setNewTag(e.target.value)} 
                          placeholder="e.g. Zari Bordes, Heavy Pallu"
                          className="glass-input flex-1 py-1.5 px-3 text-xs" 
                        />
                        <button type="button" onClick={addTag} className="btn-secondary py-1.5 px-4 flex items-center justify-center font-bold !cursor-pointer">
                          <Plus size={16} />
                          Add
                        </button>
                      </div>
                      
                      {/* Attached display */}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {tags.map(t => (
                            <span key={t} className="flex items-center gap-1.5 bg-[#4A154B]/5 border border-[#4A154B]/10 rounded-full px-2.5 py-1 text-[11px] font-bold text-[#4A154B]">
                              {t}
                              <button type="button" onClick={() => removeTag(t)} className="text-red-500 hover:text-red-700 font-bold focus:outline-none">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Suggestions */}
                    <div className="space-y-3 bg-[#FAF8F5]/60 border border-[#4A154B]/5 p-4 rounded-2xl">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#4A154B]/50 block">Quick Suggestions (Tap to add)</label>
                      {existingTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
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
                              className="bg-[#4A154B]/5 hover:bg-[#4A154B]/10 border border-[#4A154B]/10 rounded-full px-3 py-1 text-[10px] text-[#4A154B] font-bold transition !cursor-pointer"
                            >
                              + {tagSuggestion}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#1A1A1A]/40 font-medium block">No collection tags found yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Founder curations & Cost logs */}
                <div className="ui-card p-6 sm:p-8 space-y-6">
                  <h3 className="font-display font-bold text-base text-[#4A154B] border-b border-[#4A154B]/5 pb-3 flex items-center gap-2">
                    <Sparkles size={18} className="text-[#D4AF37]" />
                    3. Exclusive Curation &amp; Private Notes
                  </h3>

                  {/* Exclusive toggle */}
                  <div className="flex items-center gap-4 bg-[#D4AF37]/5 border border-[#D4AF37]/20 p-4 rounded-2xl">
                    <input
                      type="checkbox"
                      id="foundersExclusive"
                      disabled={!video}
                      checked={foundersExclusive}
                      onChange={(e) => setFoundersExclusive(e.target.checked)}
                      className={`w-5 h-5 accent-[#4A154B] rounded cursor-pointer disabled:opacity-40 ${!video ? "!cursor-not-allowed" : "!cursor-pointer"}`}
                    />
                    <div>
                      <label htmlFor="foundersExclusive" className={`text-sm font-bold text-[#4A154B] cursor-pointer flex items-center gap-1.5 ${!video ? "!cursor-not-allowed" : "!cursor-pointer"}`}>
                        Mark as &quot;Founder&apos;s Exclusive&quot; Curation
                        {!video && (
                          <span className="text-[10px] text-red-500 font-semibold border border-red-200 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1 select-none">
                            <Info size={10} />
                            Requires Short Video Upload
                          </span>
                        )}
                      </label>
                      <p className="text-xs text-[#1A1A1A]/60 mt-1">
                        Automatically highlights this saree inside the prestigious Founder curation catalogs on the storefront.
                      </p>
                    </div>
                  </div>

                  {/* Private admin notes */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Private Admin Notes (Redis Only)</label>
                    <textarea
                      rows={3}
                      value={privateNotes}
                      onChange={(e) => setPrivateNotes(e.target.value)}
                      placeholder="Weaver details, custom materials pricing notes, showroom storage index... (Completely hidden from storefront/customers)"
                      className="glass-input resize-none"
                    />
                  </div>
                </div>

                {/* Bottom navigation bar */}
                <div className="flex justify-between items-center pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="btn-secondary py-3 px-6 text-xs uppercase tracking-wider font-bold flex items-center gap-2 !cursor-pointer"
                  >
                    <ArrowLeft size={14} />
                    Back: Media
                  </button>

                  <div className="flex flex-col items-end gap-3">
                    {isMediaSyncing && (
                      <div className="bg-[#fffbeb] border border-[#f59e0b]/30 text-[#92400e] text-[10px] p-2.5 rounded-xl flex items-center gap-1.5 animate-pulse max-w-sm select-none">
                        <span>⚠️ Syncing media... Please wait.</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || uploadingImage || uploadingVideo || isMediaSyncing || !isStep3Valid}
                      className={`btn-primary py-3.5 px-10 text-xs uppercase tracking-wider font-bold shadow-md flex items-center gap-2 transition-all ${
                        (!isStep3Valid || loading || uploadingImage || uploadingVideo || isMediaSyncing)
                          ? "opacity-45 bg-gray-200 text-gray-400 !cursor-not-allowed shadow-none border-gray-300"
                          : "!cursor-pointer"
                      }`}
                    >
                      <Save size={16} />
                      {loading ? "Publishing Saree..." : 
                       uploadingImage ? "Uploading photos..." :
                       uploadingVideo ? "Uploading video..." :
                       isMediaSyncing ? "Syncing Media..." : "Publish & Save Saree"}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </form>
        </main>
      </div>
    </div>
  );
}
