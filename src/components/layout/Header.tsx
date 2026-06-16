"use client";

import { useEffect, useState } from "react";
import { User, Calendar, Menu } from "lucide-react";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    setDateStr(today.toLocaleDateString('en-US', options));
  }, []);

  return (
    <header className="h-16 border-b border-[#4A154B]/10 bg-white/40 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40 w-full">
      {/* Title */}
      <div className="flex items-center gap-3">
        {/* Toggle Menu Hamburger for Mobile & Tablet */}
        <button 
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          className="lg:hidden p-1.5 rounded-md text-[#4A154B] hover:bg-[#4A154B]/5 transition-colors focus:outline-none cursor-pointer"
        >
          <Menu size={20} />
        </button>

        <h2 className="font-display font-bold text-base sm:text-xl text-[#4A154B] leading-none">
          {title}
        </h2>
      </div>

      {/* Info Badges & User */}
      <div className="flex items-center gap-3 sm:gap-6">
        {/* Date Display */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#1A1A1A]/60 font-medium">
          <Calendar size={14} className="text-[#4A154B]" />
          <span>{dateStr || "Syncing Date..."}</span>
        </div>

        {/* Business entity compliance badge */}
        <div className="hidden lg:flex items-center gap-2 border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-2.5 py-1 rounded-md text-[10px] font-bold text-[#4A154B] uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-ping" />
          <span>Razorpay Compliant Setup</span>
        </div>

        {/* Support context indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-[#4A154B]/5 border border-[#4A154B]/10">
          <User size={12} className="text-[#4A154B]" />
          <span className="text-[10px] sm:text-xs font-semibold text-[#4A154B] uppercase tracking-wide">
            Admin
          </span>
        </div>
      </div>
    </header>
  );
}
