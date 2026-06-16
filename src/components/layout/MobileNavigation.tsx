"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  ShoppingBag, 
  Tag, 
  Menu, 
  X, 
  PlusCircle, 
  Layers, 
  UploadCloud, 
  Percent, 
  TrendingUp, 
  BookOpen
} from "lucide-react";

export default function MobileNavigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { label: "Dashboard", href: "/", icon: Home },
    { label: "Orders", href: "/orders", icon: ShoppingBag },
    { label: "Add Saree", href: "/products/add", icon: PlusCircle, isCenter: true },
    { label: "Products", href: "/products", icon: Layers },
    { label: "Discounts", href: "/discounts", icon: Percent },
  ];

  const sidebarLinks = [
    { label: "Dashboard", href: "/", icon: Home },
    { label: "Live Orders", href: "/orders", icon: ShoppingBag },
    { label: "Products Catalog", href: "/products", icon: Layers },
    { label: "Add New Saree", href: "/products/add", icon: PlusCircle },
    { label: "Bulk CSV Upload", href: "/bulk-upload", icon: UploadCloud },
    { label: "Deals & Discounts", href: "/discounts", icon: Percent },
    { label: "Financial Margins", href: "/financials", icon: TrendingUp },
    { label: "Weaver Stories", href: "/founder-story", icon: BookOpen },
  ];

  return (
    <>
      {/* Top Mobile Bar */}
      <header className="md:hidden sticky top-0 z-[140] w-full h-14 bg-white/85 backdrop-blur-md border-b border-[#4A154B]/10 flex items-center justify-between px-4">
        <Link href="/" className="font-display font-bold text-base text-[#4A154B] tracking-wide no-underline">
          Reshmi Pallu CRM
        </Link>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 text-[#4A154B] hover:bg-[#4A154B]/5 rounded-lg transition-colors cursor-pointer"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Slide-out Hamburger Drawer */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 z-[145] bg-black/40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <aside 
            className="w-72 max-w-[80vw] h-full bg-[#FAF8F5] shadow-2xl flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[#4A154B]/5 pb-4 mb-6">
              <span className="font-display font-bold text-[#4A154B]">CRM Directory</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full text-[#1A1A1A]/40 hover:text-[#4A154B] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 space-y-2">
              {sidebarLinks.map((link) => {
                const isActive = pathname === link.href;
                const Icon = link.icon;

                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all no-underline ${
                      isActive 
                        ? "bg-[#4A154B] text-white" 
                        : "text-[#4A154B] hover:bg-[#4A154B]/5"
                    }`}
                  >
                    <Icon size={16} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[140] h-16 bg-white/90 backdrop-blur-md border-t border-[#4A154B]/10 flex items-center justify-around px-2 pb-safe">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <Link
                key={item.label}
                href={item.href}
                className="relative -top-3 w-12 h-12 rounded-full bg-[#4A154B] border-4 border-[#FAF8F5] text-[#D4AF37] flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer no-underline"
                title={item.label}
              >
                <Icon size={22} />
              </Link>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center gap-1.5 flex-1 py-1 no-underline transition-colors cursor-pointer ${
                isActive ? "text-[#4A154B]" : "text-[#1A1A1A]/40 hover:text-[#4A154B]/60"
              }`}
            >
              <Icon size={18} className={isActive ? "stroke-[2.5px]" : "stroke-[2px]"} />
              <span className="text-[9px] font-bold tracking-wide uppercase leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
