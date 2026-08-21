import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useVault } from "@/context/VaultContext";
import { 
  Shield, 
  Wallet as WalletIcon, 
  ChevronDown, 
  Lock, 
  Trash2, 
  ShieldCheck, 
  ClipboardList, 
  Building2, 
  User, 
  LogOut,
  Plus,
  Check
} from "lucide-react";
import { api } from "@/lib/api";

interface AppShellProps {
  children: React.ReactNode;
  pageTitle: string;
  headerActions?: React.ReactNode;
}

export function AppShell({ children, pageTitle, headerActions }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { vaultKey, email, clearSession, wallets, activeWalletId, selectWallet } = useVault();
  const [isWalletDropdownOpen, setWalletDropdownOpen] = useState(false);

  // Protected route check
  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
    }
  }, [vaultKey, router]);

  if (!vaultKey) return null;

  const activeWallet = wallets.find(w => w.id === activeWalletId);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout", {});
    } catch (e) {
      // ignore
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  const navLinks = [
    { name: "Vault", path: "/vault", icon: Lock },
    { name: "Trash", path: "/trash", icon: Trash2 },
    { name: "Security Health", path: "/settings/security", icon: ShieldCheck },
    { name: "Audit Log", path: "/audit", icon: ClipboardList },
    { name: "Enterprise", path: "/enterprise", icon: Building2 },
    { name: "Profile", path: "/profile", icon: User },
  ];

  return (
    <div className="flex w-full min-h-screen bg-[#f8fafc]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-white border-r border-slate-200 flex flex-col p-6 z-50">
        {/* Top Section */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-light rounded-lg flex items-center justify-center text-primary">
            <Shield size={24} className="fill-current" />
          </div>
          <div className="flex flex-col">
            <span className="text-[18px] font-bold text-slate-900 leading-tight">Sentinel Vault</span>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
              <ShieldCheck size={12} /> Zero-Knowledge Secure
            </div>
          </div>
        </div>

        {/* Wallet Switcher */}
        <div className="mt-6 relative">
          <button 
            onClick={() => setWalletDropdownOpen(!isWalletDropdownOpen)}
            className="w-full bg-slate-50 border-[1.5px] border-slate-200 rounded-xl px-3.5 py-3 flex justify-between items-center hover:border-primary-border hover:bg-primary-light transition-all duration-150"
          >
            <div className="flex items-center gap-2">
              <WalletIcon size={18} className="text-primary" />
              <div className="flex flex-col items-start text-left">
                <span className="text-[13px] font-semibold text-slate-900">{activeWallet?.name || "Loading..."}</span>
                <span className="text-[11px] text-slate-400 capitalize">{activeWallet?.type || ""}</span>
              </div>
            </div>
            <ChevronDown size={18} className="text-slate-400" />
          </button>

          {isWalletDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setWalletDropdownOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.10)] p-2">
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => { selectWallet(w.id); setWalletDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-slate-900">{w.name}</span>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary-light text-primary border border-primary-border capitalize">
                        {w.type}
                      </span>
                    </div>
                    {w.id === activeWalletId && <Check size={16} className="text-primary" />}
                  </button>
                ))}
                <div className="h-px bg-slate-100 my-2" />
                <button 
                  onClick={() => { /* Handle new wallet */ setWalletDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-[14px] font-medium text-primary"
                >
                  <Plus size={16} /> New Wallet
                </button>
              </div>
            </>
          )}
        </div>

        {/* Nav Links */}
        <nav className="mt-4 flex-1 flex flex-col gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.path;
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-150 ${
                  isActive 
                    ? "bg-primary-light text-primary font-semibold" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <link.icon size={20} className={isActive ? "fill-primary/20" : ""} />
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="mt-auto pt-4 border-t border-slate-100">
          <div className="mb-2 truncate text-[12px] text-slate-400">
            {email}
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-[13px] font-medium text-rose-500 hover:text-rose-700 transition-colors py-2"
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-[260px] flex flex-col min-h-screen">
        <header className="sticky top-0 z-40 h-[80px] px-10 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h1 className="text-[20px] font-bold text-slate-900 leading-tight">{pageTitle}</h1>
            <span className="text-[13px] text-slate-400">{activeWallet?.name || "Loading wallet..."}</span>
          </div>
          <div className="flex items-center gap-4">
            {headerActions}
          </div>
        </header>
        
        <div className="flex-1 p-10 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
