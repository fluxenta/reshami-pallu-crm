"use client";

import { useState, useEffect } from "react";
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
  rules?: Array<{ column: string; condition: string }>;
}

interface CollectionsListProps {
  initialCollections: Collection[];
}

export default function CollectionsList({ initialCollections }: CollectionsListProps) {
  const [collections, setCollections] = useState<Collection[]>(initialCollections);
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [disabledTags, setDisabledTags] = useState<string[]>([]);


  useEffect(() => {
    fetch("/api/collections/disable")
      .then(r => r.json())
      .then(d => {
        if (d.disabledTags) setDisabledTags(d.disabledTags);
      })
      .catch(console.error);
  }, []);

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

  const handleDisable = async (e: React.MouseEvent, tag: string, currentlyDisabled: boolean) => {
    e.preventDefault();
    if (!confirm(`Are you sure you want to ${currentlyDisabled ? "enable" : "disable"} this collection in the Storefront navbar?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/collections/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, disabled: !currentlyDisabled }),
      });
      if (res.ok) {
        setDisabledTags(prev => !currentlyDisabled ? [...prev, tag.toLowerCase()] : prev.filter(t => t.toLowerCase() !== tag.toLowerCase()));
      } else {
        const d = await res.json();
        alert(d.error || "Action failed");
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, collectionId: string, tag: string) => {
    e.preventDefault();
    if (!confirm(`WARNING: This will permanently remove the tag '${tag}' from all products and delete this collection. Continue?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/collections/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, tag }),
      });
      if (res.ok) {
        setCollections(prev => prev.filter(c => c.id !== collectionId));
      } else {
        const d = await res.json();
        alert(d.error || "Action failed");
      }
    } catch (err) {
      alert((err as Error).message);
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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from(new Map(collections.map(c => [c.id, c])).values())
                .filter(c => !c.title.includes("[Auto]"))
                .map((c) => {
                const tagRule = c.rules?.find(r => r.column === "TAG");
                const collectionTag = tagRule?.condition || c.title; // fallback
                const isProtected = c.title.toLowerCase() === "all sarees" || c.title.toLowerCase().includes("founder") || collectionTag.toLowerCase().includes("founder");
                const isCurrentlyDisabled = disabledTags.some(t => t.toLowerCase() === collectionTag.toLowerCase());

                return (
                  <div key={c.id} className="relative group">
                    <a 
                      href={`https://reshmipallu.com/collections/${c.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-between p-4 rounded-xl border border-[#4A154B]/10 transition-all duration-200 no-underline cursor-pointer h-full ${isCurrentlyDisabled ? 'bg-gray-50 opacity-70' : 'bg-white/60 hover:bg-[#4A154B]/5 hover:shadow-md'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${isCurrentlyDisabled ? 'bg-gray-200 border-gray-300 text-gray-500' : 'bg-[#4A154B]/5 border-[#4A154B]/10 text-[#4A154B] group-hover:bg-[#4A154B]/10'}`}>
                          <ShoppingBag size={18} />
                        </div>
                        <div>
                          <span className={`font-semibold text-sm block leading-tight ${isCurrentlyDisabled ? 'text-gray-600' : 'text-[#4A154B]'}`}>
                            {c.title}
                          </span>
                          <span className="text-[10px] text-[#1A1A1A]/50 font-mono mt-1 block">
                            slug: {c.handle}
                          </span>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <span className={`border rounded-full px-2.5 py-1 text-[10px] font-bold ${isCurrentlyDisabled ? 'bg-gray-200 text-gray-600 border-gray-200' : 'bg-[#E6F0EA] text-[#137333] border-[#E6F0EA]'}`}>
                          {c.productsCount} Sarees
                        </span>
                      </div>
                    </a>

                    {/* Actions overlay - only show on hover if not protected */}
                    {!isProtected && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          type="button"
                          disabled={loading}
                          onClick={(e) => handleDisable(e, collectionTag, isCurrentlyDisabled)}
                          className={`px-2 py-1 text-[10px] font-bold rounded-md cursor-pointer transition ${isCurrentlyDisabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                          title={isCurrentlyDisabled ? "Enable in Nav" : "Disable in Nav"}
                        >
                          {isCurrentlyDisabled ? "Enable" : "Disable"}
                        </button>
                        <button 
                          type="button"
                          disabled={loading}
                          onClick={(e) => handleDelete(e, c.id, collectionTag)}
                          className="px-2 py-1 text-[10px] font-bold rounded-md bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer transition"
                          title="Delete Collection & Remove Tag"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Metafield Collections Section */}
            {collections.some(c => c.title.includes("[Auto]")) && (
              <div className="mt-8">
                <h4 className="font-display font-bold text-sm text-[#4A154B] mb-4 flex items-center gap-2">
                  <FolderHeart size={14} className="text-[#4A154B]/60" />
                  Metafield Collections (Automated)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from(new Map(collections.map(c => [c.id, c])).values())
                    .filter(c => c.title.includes("[Auto]"))
                    .map((c) => {
                    const tagRule = c.rules?.find(r => r.column === "TAG");
                    const collectionTag = tagRule?.condition || c.title; // fallback
                    const isProtected = c.title.toLowerCase() === "all sarees" || c.title.toLowerCase().includes("founder") || collectionTag.toLowerCase().includes("founder");
                    const isCurrentlyDisabled = disabledTags.some(t => t.toLowerCase() === collectionTag.toLowerCase());

                    return (
                      <div key={c.id} className="relative group">
                        <a 
                          href={`https://reshmipallu.com/collections/${c.handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-between p-4 rounded-xl border border-[#4A154B]/10 transition-all duration-200 no-underline cursor-pointer h-full ${isCurrentlyDisabled ? 'bg-gray-50 opacity-70' : 'bg-white/60 hover:bg-[#4A154B]/5 hover:shadow-md'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${isCurrentlyDisabled ? 'bg-gray-200 border-gray-300 text-gray-500' : 'bg-[#4A154B]/5 border-[#4A154B]/10 text-[#4A154B] group-hover:bg-[#4A154B]/10'}`}>
                              <ShoppingBag size={18} />
                            </div>
                            <div>
                              <span className={`font-semibold text-sm block leading-tight ${isCurrentlyDisabled ? 'text-gray-600' : 'text-[#4A154B]'}`}>
                                {c.title}
                              </span>
                              <span className="text-[10px] text-[#1A1A1A]/50 font-mono mt-1 block">
                                slug: {c.handle}
                              </span>
                            </div>
                          </div>

                          <div className="text-right flex items-center gap-2">
                            <span className={`border rounded-full px-2.5 py-1 text-[10px] font-bold ${isCurrentlyDisabled ? 'bg-gray-200 text-gray-600 border-gray-200' : 'bg-[#E6F0EA] text-[#137333] border-[#E6F0EA]'}`}>
                              {c.productsCount} Sarees
                            </span>
                          </div>
                        </a>

                        {/* Actions overlay - only show on hover if not protected */}
                        {!isProtected && (
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              type="button"
                              disabled={loading}
                              onClick={(e) => handleDisable(e, collectionTag, isCurrentlyDisabled)}
                              className={`px-2 py-1 text-[10px] font-bold rounded-md cursor-pointer transition ${isCurrentlyDisabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                              title={isCurrentlyDisabled ? "Enable in Nav" : "Disable in Nav"}
                            >
                              {isCurrentlyDisabled ? "Enable" : "Disable"}
                            </button>
                            <button 
                              type="button"
                              disabled={loading}
                              onClick={(e) => handleDelete(e, c.id, collectionTag)}
                              className="px-2 py-1 text-[10px] font-bold rounded-md bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer transition"
                              title="Delete Collection & Remove Tag"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
