"use client";

import Link from "next/link";
import { WalletSwitcher } from "@/components/WalletSwitcher";
import { clearTokens, api } from "@/lib/api";
import { Shield, Lock, Trash2, Activity, ScrollText, Building, User, Settings, HelpCircle } from "lucide-react";

interface SidebarProps {
  activePage: "vault" | "trash" | "security" | "audit" | "enterprise" | "profile";
  email: string | null;
}

export function Sidebar({ activePage, email }: SidebarProps) {
  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore network errors on logout
    }
    clearTokens();
    window.location.href = "/login";
  }

  function activeClass(page: string) {
    return activePage === page 
      ? "flex items-center gap-3 px-3 py-2 bg-primary/10 text-primary font-semibold rounded-md transition-colors"
      : "flex items-center gap-3 px-3 py-2 text-text hover:bg-black/5 hover:text-text rounded-md transition-colors";
  }

  return (
    <nav className="hidden md:flex w-[240px] bg-background border-r border-border flex-col py-4 px-3 gap-2 shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-2 py-2 mb-2">
        <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
          <Shield size={20} />
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="font-bold text-primary text-[15px] leading-tight">Main Vault</div>
          <div className="text-xs text-text-muted truncate">
            Enterprise Tier
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 flex flex-col gap-1">
        <Link href="/vault" className={activeClass("vault")}>
          <Lock size={18} />
          <span className="text-sm font-medium">Vault</span>
        </Link>
        <Link href="/trash" className={activeClass("trash")}>
          <Trash2 size={18} />
          <span className="text-sm font-medium">Trash</span>
        </Link>
        <Link href="/settings/security" className={activeClass("security")}>
          <Activity size={18} />
          <span className="text-sm font-medium">Security Health</span>
        </Link>
        <Link href="/audit" className={activeClass("audit")}>
          <ScrollText size={18} />
          <span className="text-sm font-medium">Audit Log</span>
        </Link>
        <Link href="/enterprise" className={activeClass("enterprise")}>
          <Building size={18} />
          <span className="text-sm font-medium">Enterprise</span>
        </Link>
        <Link href="/profile" className={activeClass("profile")}>
          <User size={18} />
          <span className="text-sm font-medium">Profile</span>
        </Link>
      </div>

      {/* Footer */}
      <div className="mt-auto flex flex-col gap-1 pt-4 border-t border-border">
        <Link href="/settings/security" className="px-3 py-2 w-full text-left rounded-md text-text hover:bg-black/5 hover:text-text text-sm font-medium transition-colors flex items-center gap-3">
          <Settings size={18} />
          Settings
        </Link>
        <button className="px-3 py-2 w-full text-left rounded-md text-text hover:bg-black/5 hover:text-text text-sm font-medium transition-colors flex items-center gap-3 mb-4">
          <HelpCircle size={18} />
          Support
        </button>
        <button onClick={logout} className="px-3 py-2 w-full text-center rounded-md border border-border bg-surface text-text hover:bg-black/5 text-sm font-medium transition-colors">
          Sign Out
        </button>
      </div>
    </nav>
  );
}
