"use client";

import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Sparkles, UploadCloud, Save, Image as ImageIcon, CheckCircle, RefreshCw } from "lucide-react";

interface MediaStatus {
  status: "queued" | "processing" | "success" | "completed" | "failed";
  shopifyUrl?: string | null;
  error?: string | null;
  base64Key?: string | null;
}

export default function FounderStoryAdminPage() {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus | null>(null);
  const [uploadedBase64Key, setUploadedBase64Key] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch current story data from Redis via our API
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/founder-story");
        if (res.ok) {
          const data = await res.json();
          setText(data.text || "");
          setImageUrl(data.image || "");
        }
      } catch (err) {
        console.error("Failed to load founder's story data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Poll for uploaded media processing status
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
            base64Key: data.base64Key,
          });

          if ((data.status === "success" || data.status === "completed") && data.shopifyUrl) {
            setImageUrl(data.shopifyUrl);
            if (data.base64Key) setUploadedBase64Key(data.base64Key);
            setMediaId(null); // Stop polling
            setMediaStatus(null);
            setUploading(false);
          } else if (data.status === "failed") {
            setMediaId(null); // Stop polling
            setUploading(false);
            alert("Image optimization/upload failed: " + data.error);
          }
        }
      } catch (err) {
        console.error("Error polling upload status:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [mediaId]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
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
      setMediaStatus({ status: "queued" });
    } catch (err: any) {
      alert("Image upload failed: " + err.message);
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/founder-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, image: imageUrl, imageBase64Key: uploadedBase64Key }),
      });

      if (res.ok) {
        alert("Founder's story successfully synced to the storefront website!");
      } else {
        throw new Error("Failed to save data");
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
        <Header title="Founder's Story" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1000px] mx-auto w-full space-y-6 sm:space-y-8">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/40 border border-[#4A154B]/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-[#4A154B] flex items-center gap-2">
                <Sparkles size={18} className="text-[#D4AF37]" />
                Founder's Story Page Manager
              </h3>
              <p className="text-xs text-[#1A1A1A]/60 mt-0.5">
                Upload your beautiful narrative and portrait picture to sync instantly with the storefront.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-2">
              <RefreshCw className="animate-spin text-[#4A154B]" size={28} />
              <p className="text-sm text-[#1A1A1A]/60">Loading story details...</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-12 gap-8">
              
              {/* Form entries */}
              <div className="md:col-span-7 space-y-6">
                <div className="ui-card p-6 space-y-4">
                  <h4 className="font-display font-bold text-base text-[#4A154B]">
                    Narrative Story
                  </h4>
                  <p className="text-xs text-[#1A1A1A]/50 leading-relaxed">
                    Write a premium, beautiful narrative about the origin of Reshami Pallu, your selections, and our handwoven brand values. HTML line-breaks are preserved.
                  </p>
                  
                  <div>
                    <label className="block text-xs uppercase font-bold text-[#1A1A1A]/70 mb-1.5">
                      Story Text
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={12}
                      className="w-full text-sm rounded-lg border border-[#4A154B]/10 p-3 bg-white/50 focus:bg-white focus:outline-none focus:border-[#4A154B] transition-colors leading-relaxed"
                      placeholder="Once upon a time in Banaras..."
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving || uploading}
                    className="btn-primary flex items-center gap-2 py-3 px-6 shadow-lg rounded-xl uppercase tracking-wider text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Saving Story...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        Publish to storefront
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Photo Upload Card */}
              <div className="md:col-span-5 space-y-6">
                <div className="ui-card p-6 space-y-6">
                  <div>
                    <h4 className="font-display font-bold text-[#4A154B] text-base">
                      Founder's Portrait
                    </h4>
                    <p className="text-xs text-[#1A1A1A]/50 mt-0.5">
                      A premium quality front-facing portrait image.
                    </p>
                  </div>

                  {/* Image Display */}
                  <div className="relative aspect-[3/4] w-full bg-[#FAF8F5] rounded-xl overflow-hidden border border-[#4A154B]/10 flex flex-col items-center justify-center group shadow-inner">
                    {imageUrl ? (
                      <>
                        <img
                          src={imageUrl}
                          alt="Founder portrait"
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute inset-0 bg-[#4A154B]/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200 text-white text-xs font-semibold uppercase tracking-wider gap-2 cursor-pointer"
                        >
                          <UploadCloud size={16} />
                          Replace Image
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-[#4A154B]/5 flex items-center justify-center text-[#4A154B]">
                          <ImageIcon size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#1A1A1A]/70">No portrait uploaded yet</p>
                          <p className="text-[10px] text-[#1A1A1A]/40 mt-1 max-w-[200px] mx-auto">
                            Recommended size: 600x800 px in high sheen portrait.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="btn-secondary py-2 px-3 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Choose Photo
                        </button>
                      </div>
                    )}

                    {uploading && (
                      <div className="absolute inset-0 bg-[#FAF8F5]/90 flex flex-col items-center justify-center p-4 text-center space-y-2.5">
                        <RefreshCw className="animate-spin text-[#4A154B]" size={24} />
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-[#1A1A1A]">Optimizing Media</p>
                          <p className="text-[10px] text-[#1A1A1A]/60 font-medium">
                            {mediaStatus?.status === "processing" 
                              ? "Applying smart handloom glaze..." 
                              : "Queuing on Vercel workers..."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageChange}
                    accept="image/*"
                    className="hidden"
                  />

                  {imageUrl && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg p-3 text-xs text-green-700">
                      <CheckCircle size={14} className="flex-shrink-0" />
                      <span>Portrait synced via Shopify CDN! URL is mapped to Redis.</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs uppercase font-bold text-[#1A1A1A]/70 mb-1">
                      Direct CDN Image Link
                    </label>
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="w-full text-xs rounded-lg border border-[#4A154B]/10 p-2 bg-white/50 focus:bg-white focus:outline-none focus:border-[#4A154B] transition-colors font-mono"
                      placeholder="https://cdn.shopify.com/..."
                    />
                  </div>

                </div>
              </div>

            </form>
          )}

        </main>
      </div>
    </div>
  );
}
