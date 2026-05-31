"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Lock } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Authentication failed");
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-4">
      {/* Premium Login Wrapper */}
      <div className="w-full max-w-[420px] ui-card p-8 sm:p-10 shadow-2xl relative overflow-hidden">
        
        {/* Subtle Decorative Gradient */}
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-[#4A154B] opacity-5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-[#D4AF37] opacity-5 blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-8">
          {/* Brand Emblem */}
          <img 
            src="/logo.jpg" 
            alt="Reshmi Pallu Logo" 
            className="w-16 h-16 rounded-full object-cover shadow-lg mb-4 border border-[#4A154B]/10" 
          />
          
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#4A154B] leading-tight">
            Reshmi Pallu
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#4A154B]/60 font-semibold mt-1" style={{ letterSpacing: "2px" }}>
            Admin Dashboard
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A]/70 flex items-center gap-1.5">
              <Lock size={12} />
              Administrative Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••••••"
              required
              className="glass-input w-full text-center tracking-widest placeholder:tracking-normal focus:placeholder:opacity-0"
              style={{ letterSpacing: password ? "4px" : "normal" }}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200/50 rounded-lg p-3 text-center animate-pulse">
              ⚠️ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-sm font-semibold uppercase tracking-wider flex items-center justify-center gap-2"
            style={{ letterSpacing: "1px" }}
          >
            {loading ? "Authorizing Session..." : "Access Dashboard"}
          </button>
        </form>

        <p className="text-[10px] text-center text-[#1A1A1A]/40 mt-8 leading-relaxed">
          Proprietorship of Mrinalini Singh
          <br />
          UDYAM-KR-03-0697865 | IEC: LWPPS2548F
        </p>
      </div>
    </main>
  );
}
