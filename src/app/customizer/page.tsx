"use client";

import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Sparkles, UploadCloud, Save, Image as ImageIcon, CheckCircle, RefreshCw, Type, Eye } from "lucide-react";

interface MediaStatus {
  status: "queued" | "processing" | "success" | "completed" | "failed";
  shopifyUrl?: string | null;
  error?: string | null;
}

export default function StoreCustomizerPage() {
  const [heroImage, setHeroImage] = useState("");
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [loginImage, setLoginImage] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Track separate upload states for Hero and Login banners
  const [uploadTarget, setUploadTarget] = useState<"hero" | "login" | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus | null>(null);

  const heroInputRef = useRef<HTMLInputElement>(null);
  const loginInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch current settings from Redis via API
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/customizer");
        if (res.ok) {
          const data = await res.json();
          setHeroImage(data.heroImage || "");
          setHeroTitle(data.heroTitle || "");
          setHeroSubtitle(data.heroSubtitle || "");
          setLoginImage(data.loginImage || "");
        }
      } catch (err) {
        console.error("Failed to load customizer settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // 2. Poll for uploaded media processing status
  useEffect(() => {
    if (!mediaId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/upload/status?id=${mediaId}`);
        if (res.ok) {
          const data = await res.json();
          setMediaStatus({
            status: data.status,
            shopifyUrl: data.shopifyUrl,
            error: data.error,
          });

          if ((data.status === "success" || data.status === "completed") && data.shopifyUrl) {
            if (uploadTarget === "hero") {
              setHeroImage(data.shopifyUrl);
            } else if (uploadTarget === "login") {
              setLoginImage(data.shopifyUrl);
            }
            setMediaId(null); // Stop polling
            setUploadTarget(null);
            setMediaStatus(null);
          } else if (data.status === "failed") {
            setMediaId(null); // Stop polling
            setUploadTarget(null);
            alert("Image optimization/upload failed: " + data.error);
          }
        }
      } catch (err) {
        console.error("Error polling upload status:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [mediaId, uploadTarget]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "hero" | "login") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadTarget(target);
    setMediaId(null);
    setMediaStatus({ status: "queued" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setMediaId(data.id);
    } catch (err: any) {
      alert("Image upload failed: " + err.message);
      setUploadTarget(null);
      setMediaStatus(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/customizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroImage,
          heroTitle,
          heroSubtitle,
          loginImage,
        }),
      });

      if (res.ok) {
        alert("Store assets successfully synchronized live to the storefront!");
      } else {
        throw new Error("Failed to save customization details");
      }
    } catch (err: any) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Store Customizer" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1100px] mx-auto w-full space-y-6 sm:space-y-8">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/40 border border-[#4A154B]/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-[#4A154B] flex items-center gap-2">
                <Sparkles size={18} className="text-[#D4AF37]" />
                Storefront Theme & Assets Customizer
              </h3>
              <p className="text-xs text-[#1A1A1A]/60 mt-0.5">
                Modify your landing page hero content, titles, and authentication panels live without redeploying code.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-2">
              <RefreshCw className="animate-spin text-[#4A154B]" size={28} />
              <p className="text-sm text-[#1A1A1A]/60">Loading theme configuration...</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-8">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* LEFT: HERO TEXT AND META CONFIGURATIONS */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* Hero Text customizer */}
                  <div className="ui-card p-6 space-y-5">
                    <div className="flex items-center gap-2 pb-3 border-b border-[#4A154B]/10">
                      <Type className="text-[#4A154B]" size={18} />
                      <h4 className="font-display font-bold text-base text-[#4A154B]">
                        Hero Overlay Copy
                      </h4>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase font-bold text-[#1A1A1A]/70 mb-1.5 flex justify-between">
                          <span>Hero Main Title</span>
                          <span className="text-[10px] text-[#4A154B]/60 normal-case">{heroTitle.length}/30 chars</span>
                        </label>
                        <input
                          type="text"
                          value={heroTitle}
                          onChange={(e) => setHeroTitle(e.target.value.toUpperCase())}
                          className="w-full text-sm font-semibold rounded-lg border border-[#4A154B]/10 p-3 bg-white/50 focus:bg-white focus:outline-none focus:border-[#4A154B] transition-colors"
                          placeholder="BORN TO DAZZLE"
                          maxLength={30}
                          required
                        />
                        <p className="text-[10px] text-[#1A1A1A]/40 mt-1">
                          Displays in elegant italicized display typography. Auto-capitalized.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs uppercase font-bold text-[#1A1A1A]/70 mb-1.5 flex justify-between">
                          <span>Hero Subtitle Line</span>
                          <span className="text-[10px] text-[#4A154B]/60 normal-case">{heroSubtitle.length}/80 chars</span>
                        </label>
                        <textarea
                          value={heroSubtitle}
                          onChange={(e) => setHeroSubtitle(e.target.value)}
                          rows={3}
                          className="w-full text-sm rounded-lg border border-[#4A154B]/10 p-3 bg-white/50 focus:bg-white focus:outline-none focus:border-[#4A154B] transition-colors"
                          placeholder="CRAFTED TO STAND OUT—JUST LIKE YOU."
                          maxLength={80}
                          required
                        />
                        <p className="text-[10px] text-[#1A1A1A]/40 mt-0.5">
                          Displays inside the elegant transparent gold border box underneath the title.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic URL Copy Inputs */}
                  <div className="ui-card p-6 space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-[#4A154B]/10">
                      <Eye className="text-[#4A154B]" size={18} />
                      <h4 className="font-display font-bold text-base text-[#4A154B]">
                        Live Image Links
                      </h4>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase font-bold text-[#1A1A1A]/70 mb-1">
                          Hero CDN Image URL
                        </label>
                        <input
                          type="text"
                          value={heroImage}
                          onChange={(e) => setHeroImage(e.target.value)}
                          className="w-full text-xs rounded-lg border border-[#4A154B]/10 p-2 bg-white/50 focus:bg-white focus:outline-none focus:border-[#4A154B] transition-colors font-mono"
                          placeholder="https://cdn.shopify.com/..."
                        />
                      </div>

                      <div>
                        <label className="block text-xs uppercase font-bold text-[#1A1A1A]/70 mb-1">
                          Login Page CDN Image URL
                        </label>
                        <input
                          type="text"
                          value={loginImage}
                          onChange={(e) => setLoginImage(e.target.value)}
                          className="w-full text-xs rounded-lg border border-[#4A154B]/10 p-2 bg-white/50 focus:bg-white focus:outline-none focus:border-[#4A154B] transition-colors font-mono"
                          placeholder="https://cdn.shopify.com/..."
                        />
                      </div>
                    </div>
                  </div>

                </div>

                {/* RIGHT: PHOTO BANNERS MANAGEMENT */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* Hero Banner Box */}
                  <div className="ui-card p-6 space-y-4">
                    <div>
                      <h4 className="font-display font-bold text-[#4A154B] text-base">
                        Storefront Hero Banner
                      </h4>
                      <p className="text-xs text-[#1A1A1A]/50">
                        Primary widescreen landscape image.
                      </p>
                    </div>

                    <div className="relative aspect-[16/9] w-full bg-[#FAF8F5] rounded-xl overflow-hidden border border-[#4A154B]/10 flex flex-col items-center justify-center group shadow-inner">
                      {heroImage ? (
                        <>
                          <img
                            src={heroImage}
                            alt="Storefront Hero"
                            className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          <button
                            type="button"
                            onClick={() => heroInputRef.current?.click()}
                            className="absolute inset-0 bg-[#4A154B]/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200 text-white text-xs font-semibold uppercase tracking-wider gap-2 cursor-pointer"
                          >
                            <UploadCloud size={16} />
                            Change Hero
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-4">
                          <ImageIcon size={24} className="text-[#4A154B]/20 mx-auto" />
                          <button
                            type="button"
                            onClick={() => heroInputRef.current?.click()}
                            className="text-xs text-[#4A154B] font-bold mt-2 hover:underline cursor-pointer"
                          >
                            Upload Image
                          </button>
                        </div>
                      )}

                      {uploadTarget === "hero" && mediaStatus && (
                        <div className="absolute inset-0 bg-[#FAF8F5]/90 flex flex-col items-center justify-center p-4 text-center space-y-2">
                          <RefreshCw className="animate-spin text-[#4A154B]" size={20} />
                          <p className="text-[10px] font-bold text-[#1A1A1A]">
                            {mediaStatus.status === "processing" ? "Polishing file..." : "Queuing..."}
                          </p>
                        </div>
                      )}
                    </div>

                    <input
                      type="file"
                      ref={heroInputRef}
                      onChange={(e) => handleImageUpload(e, "hero")}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>

                  {/* Login Banner Box */}
                  <div className="ui-card p-6 space-y-4">
                    <div>
                      <h4 className="font-display font-bold text-[#4A154B] text-base">
                        Login Screen Banner
                      </h4>
                      <p className="text-xs text-[#1A1A1A]/50">
                        Vertical portrait image shown during login.
                      </p>
                    </div>

                    <div className="relative aspect-[3/4.2] w-full max-w-[260px] mx-auto bg-[#FAF8F5] rounded-xl overflow-hidden border border-[#4A154B]/10 flex flex-col items-center justify-center group shadow-inner">
                      {loginImage ? (
                        <>
                          <img
                            src={loginImage}
                            alt="Login Screen Banner"
                            className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          <button
                            type="button"
                            onClick={() => loginInputRef.current?.click()}
                            className="absolute inset-0 bg-[#4A154B]/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200 text-white text-xs font-semibold uppercase tracking-wider gap-2 cursor-pointer"
                          >
                            <UploadCloud size={16} />
                            Change Banner
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-4">
                          <ImageIcon size={24} className="text-[#4A154B]/20 mx-auto" />
                          <button
                            type="button"
                            onClick={() => loginInputRef.current?.click()}
                            className="text-xs text-[#4A154B] font-bold mt-2 hover:underline cursor-pointer"
                          >
                            Upload Image
                          </button>
                        </div>
                      )}

                      {uploadTarget === "login" && mediaStatus && (
                        <div className="absolute inset-0 bg-[#FAF8F5]/90 flex flex-col items-center justify-center p-4 text-center space-y-2">
                          <RefreshCw className="animate-spin text-[#4A154B]" size={20} />
                          <p className="text-[10px] font-bold text-[#1A1A1A]">
                            {mediaStatus.status === "processing" ? "Polishing file..." : "Queuing..."}
                          </p>
                        </div>
                      )}
                    </div>

                    <input
                      type="file"
                      ref={loginInputRef}
                      onChange={(e) => handleImageUpload(e, "login")}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>

                </div>

              </div>

              {/* Action save trigger */}
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={saving || uploadTarget !== null}
                  className="btn-primary flex items-center gap-2 py-3.5 px-8 shadow-lg rounded-xl uppercase tracking-wider text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Synchronizing Assets...
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      Publish Theme live
                    </>
                  )}
                </button>
              </div>

            </form>
          )}

        </main>
      </div>
    </div>
  );
}
