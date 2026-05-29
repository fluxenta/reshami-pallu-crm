"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { 
  Sparkles, 
  LayoutDashboard, 
  ShoppingBag, 
  PlusCircle, 
  UploadCloud, 
  FolderHeart, 
  LogOut,
  X,
  BookOpen,
  Package,
  ScrollText,
  UserRound,
  ShieldCheck,
  Palette
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Inventory Grid", href: "/products", icon: ShoppingBag },
  { label: "Add Saree", href: "/products/add", icon: PlusCircle },
  { label: "Bulk Upload", href: "/bulk-upload", icon: UploadCloud },
  { label: "Discounts", href: "/discounts", icon: Sparkles },
  { label: "Collections", href: "/collections", icon: FolderHeart },
  { label: "Customer Orders", href: "/orders", icon: Package },
  { label: "Founder's Story", href: "/founder-story", icon: UserRound },
  { label: "Financials", href: "/financials", icon: ScrollText },
  { label: "Shopify Policies", href: "/policies", icon: ShieldCheck },
  { label: "Store Customizer", href: "/customizer", icon: Palette },
  { label: "Operations Guide", href: "/manual", icon: BookOpen },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // Listen to mobile menu events triggered from Header
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    const handleClose = () => setIsOpen(false);

    window.addEventListener("toggle-sidebar", handleToggle);
    window.addEventListener("close-sidebar", handleClose);

    return () => {
      window.removeEventListener("toggle-sidebar", handleToggle);
      window.removeEventListener("close-sidebar", handleClose);
    };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth", { method: "DELETE" });
      if (res.ok) {
        router.push("/login");
        router.refresh();
      }
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <>
      {/* Backdrop overlay for mobile & tablet */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-[#4A154B]/30 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 border-r border-[#4A154B]/10 bg-white/95 backdrop-blur-md flex flex-col h-screen
        transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:bg-white/60 lg:flex
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        {/* Brand Header */}
        <div className="p-6 border-b border-[#4A154B]/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.jpg" 
              alt="Reshami Pallu" 
              className="w-8 h-8 rounded-full object-cover border border-[#4A154B]/10 shadow-sm" 
            />
            <div>
              <span className="font-display font-bold text-[#4A154B] text-lg block leading-none">
                Reshami Pallu
              </span>
              <span className="text-[9px] uppercase tracking-widest text-[#4A154B]/60 font-bold mt-1 block">
                Admin Panel
              </span>
            </div>
          </div>
          
          {/* Close button on mobile/tablet */}
          <button 
            type="button"
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-1.5 rounded-md text-[#4A154B]/60 hover:text-[#4A154B] hover:bg-[#4A154B]/5 transition-colors focus:outline-none cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href) && !(item.href === "/products" && pathname === "/products/add"));
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? "bg-[#4A154B] text-white shadow-md shadow-[#4A154B]/10"
                    : "text-[#1A1A1A]/70 hover:bg-[#4A154B]/5 hover:text-[#4A154B]"
                }`}
              >
                <span className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-white' : 'text-[#4A154B]'}`}>
                  <Icon size={18} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer Profile & Logout */}
        <div className="p-4 border-t border-[#4A154B]/10 bg-[#FAF8F5]/50 flex flex-col gap-3">
          {/* Founder Metadata */}
          <div className="flex items-center gap-3 px-2 py-1">
            <img 
              src="/logo.jpg" 
              alt="Mrinalini Singh" 
              className="w-9 h-9 rounded-full object-cover border border-[#D4AF37]/30 shadow-sm" 
            />
            <div>
              <span className="text-xs font-bold text-[#1A1A1A] block">
                Mrinalini Singh
              </span>
              <span className="text-[10px] text-[#1A1A1A]/50 block">
                Founder & Proprietor
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 cursor-pointer"
            style={{ letterSpacing: "0.5px" }}
          >
            <LogOut size={14} />
            End Session
          </button>
        </div>
      </aside>
    </>
  );
}
