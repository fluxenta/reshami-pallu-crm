"use client";

import { useState } from "react";
import { 
  FolderHeart, 
  Plus, 
  HelpCircle, 
  Sparkles,
  ShoppingBag,
  ListFilter
} from "lucide-react";

interface Collection {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
}

interface CollectionsListProps {
  initialCollections: Collection[];
}

export default function CollectionsList({ initialCollections }: CollectionsListProps) {
  const [collections, setCollections] = useState<Collection[]>(initialCollections);
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);

  // Template pre-fill helper
  const applyTemplate = (name: string, filterTag: string) => {
    setTitle(name);
    setTag(filterTag);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !tag) return;

    setLoading(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tag }),
      });

      if (res.ok) {
        // Reload page to fetch updated collection list
        window.location.reload();
      } else {
        const data = await res.json();
        alert("Failed to create collection: " + data.error);
      }
    } catch (err) {
      alert("Failed: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Templates & Creator Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Creation Form */}
        <div className="ui-card p-6 md:col-span-2 space-y-4">
          <h3 className="font-display font-bold text-base text-[#4A154B] flex items-center gap-2">
            <Plus size={16} />
            Create Smart Collection (Automated)
          </h3>
          <p className="text-xs text-[#1A1A1A]/60">
            Automated collections dynamically group sarees. When a saree is added or edited with the specified tag, it is automatically sorted into this collection in real-time.
          </p>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Collection Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Collection Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Banarasi Heritage Collection"
                  className="glass-input text-xs"
                />
              </div>

              {/* Tag rule */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase text-[#1A1A1A]/70">Matching Saree Tag</label>
                <input
                  type="text"
                  required
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="e.g. Banarasi"
                  className="glass-input text-xs font-semibold"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary py-2 px-5 text-xs uppercase tracking-wider font-semibold shadow-md flex items-center gap-1.5"
              >
                <span>{loading ? "Creating..." : "Create Smart Collection"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Curation Templates Sidebar */}
        <div className="ui-card p-6 flex flex-col justify-between space-y-4 bg-white/40">
          <div>
            <h4 className="font-display font-bold text-sm text-[#4A154B] flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#D4AF37]" />
              Quick Templates
            </h4>
            <p className="text-xs text-[#1A1A1A]/60 mt-1">
              Select a pre-built dynamic layout to instantly configure automated filters:
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <button 
              onClick={() => applyTemplate("Founder's Exclusive Selection", "Founders-Exclusive")}
              className="w-full text-left p-2.5 rounded-lg border border-[#4A154B]/10 hover:bg-[#4A154B]/5 hover:border-[#4A154B]/30 font-semibold text-[#4A154B] transition-all duration-200 cursor-pointer"
            >
              👑 Founder's Exclusive
            </button>
            <button 
              onClick={() => applyTemplate("Royal Banarasi Sarees", "Banarasi")}
              className="w-full text-left p-2.5 rounded-lg border border-[#4A154B]/10 hover:bg-[#4A154B]/5 hover:border-[#4A154B]/30 font-semibold text-[#4A154B] transition-all duration-200 cursor-pointer"
            >
              🌸 Royal Banarasi (Region tag)
            </button>
            <button 
              onClick={() => applyTemplate("Bridal Curation", "Bridal")}
              className="w-full text-left p-2.5 rounded-lg border border-[#4A154B]/10 hover:bg-[#4A154B]/5 hover:border-[#4A154B]/30 font-semibold text-[#4A154B] transition-all duration-200 cursor-pointer"
            >
              👰 Bridal Occasion
            </button>
          </div>
        </div>

      </div>

      {/* Existing Collections list table */}
      <div className="ui-card p-6 space-y-4">
        <h3 className="font-display font-bold text-base text-[#4A154B] flex items-center gap-2">
          <FolderHeart size={16} />
          Active Collections ({Array.from(new Map(collections.map(c => [c.id, c])).values()).length})
        </h3>

        {collections.length === 0 ? (
          <div className="h-48 rounded-xl border border-dashed border-[#4A154B]/10 flex items-center justify-center bg-[#FAF8F5]/30">
            <p className="text-xs text-[#1A1A1A]/40 font-medium">
              No active collections found in your Shopify store. Create one above!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from(new Map(collections.map(c => [c.id, c])).values()).map((c) => (
              <a 
                key={c.id} 
                href={`https://reshmipallu.com/collections/${c.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 rounded-xl border border-[#4A154B]/10 bg-white/60 hover:bg-[#4A154B]/5 hover:shadow-md transition-all duration-200 no-underline cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#4A154B]/5 border border-[#4A154B]/10 flex items-center justify-center text-[#4A154B] group-hover:bg-[#4A154B]/10 transition-colors">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-[#4A154B] block leading-tight">
                      {c.title}
                    </span>
                    <span className="text-[10px] text-[#1A1A1A]/50 font-mono mt-1 block">
                      slug: {c.handle}
                    </span>
                  </div>
                </div>

                <div className="text-right flex items-center gap-2">
                  <span className="bg-[#E6F0EA] text-[#137333] border border-[#E6F0EA] rounded-full px-2.5 py-1 text-[10px] font-bold">
                    {c.productsCount} Sarees
                  </span>
                  <span className="text-[10px] text-[#4A154B]/50 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
