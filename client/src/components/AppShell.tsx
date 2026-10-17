"use client";

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
  Check,
  Search,
  Sun,
  Moon,
  Menu,
  X,
  Sparkles,
  KeyRound
} from "lucide-react";
import { api } from "@/lib/api";
import { CommandPalette } from "@/components/CommandPalette";

interface AppShellProps {
  children: React.ReactNode;
  pageTitle: string;
  headerActions?: React.ReactNode;
  onNewCredential?: () => void;
  vaultItemsForSearch?: Array<{ id: string; name: string; username?: string; type?: string }>;
  onSelectSearchItem?: (id: string) => void;
}

export function AppShell({ 
  children, 
  pageTitle, 
  headerActions,
  onNewCredential,
  vaultItemsForSearch = [],
  onSelectSearchItem
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { vaultKey, email, clearSession, wallets, activeWalletId, selectWallet } = useVault();
  const [isWalletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Protected route check
  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
    }
  }, [vaultKey, router]);

  // Synchronize theme state with document element
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setIsDarkMode(isDark);
  }, []);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (!vaultKey) return null;

  const activeWallet = wallets.find((w) => w.id === activeWalletId);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      localStorage.setItem("sv-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      localStorage.setItem("sv-theme", "light");
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout", {});
    } catch {
      // ignore
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  const navLinks = [
    { name: "Vault", path: "/vault", icon: Lock, badge: undefined },
    { name: "Trash", path: "/trash", icon: Trash2, badge: undefined },
    { name: "Security Health", path: "/settings/security", icon: ShieldCheck, badge: "Local" },
    { name: "Audit Log", path: "/audit", icon: ClipboardList, badge: undefined },
    { name: "Enterprise", path: "/enterprise", icon: Building2, badge: undefined },
    { name: "Profile", path: "/profile", icon: User, badge: undefined },
  ];

  return (
    <div className="flex w-full min-h-screen bg-canvas text-fg selection:bg-accent/20 selection:text-accent">
      {/* ── DESKTOP SIDEBAR ──────────────────────────────────────────────── */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[260px] bg-surface/80 backdrop-blur-xl border-r border-line flex-col p-5 z-40">
        {/* Brand / Logo */}
        <Link href="/vault" className="flex items-center gap-3 group px-1 pt-1">
          <div className="w-9 h-9 rounded-xl bg-surface-2 border border-accent/40 text-accent flex items-center justify-center shadow-[0_0_15px_-3px_rgb(var(--c-accent)/0.35)] group-hover:border-accent transition-all">
            <Shield size={20} className="fill-accent/20" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-[16px] font-bold tracking-tight text-fg group-hover:text-accent transition-colors">
              SENTINEL<span className="text-accent font-medium ml-1">VAULT</span>
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-accent uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Zero-Knowledge
            </div>
          </div>
        </Link>

        {/* Wallet Switcher dropdown */}
        <div className="mt-6 relative">
          <button
            onClick={() => setWalletDropdownOpen(!isWalletDropdownOpen)}
            className="w-full bg-surface-2/60 border border-line rounded-xl px-3 py-2.5 flex justify-between items-center hover:border-line-strong hover:bg-surface-3 transition-all text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-accent border border-line shrink-0">
                <WalletIcon size={14} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-fg truncate">
                  {activeWallet?.name || "Main Vault"}
                </span>
                <span className="text-[10px] text-fg-subtle uppercase tracking-wider font-mono">
                  {activeWallet?.type || "Personal"}
                </span>
              </div>
            </div>
            <ChevronDown size={14} className="text-fg-subtle shrink-0 ml-1" />
          </button>

          {isWalletDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setWalletDropdownOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-surface border border-line rounded-xl shadow-pop p-1.5 animate-pop-in">
                <div className="px-2 py-1 text-[10px] font-mono text-fg-subtle uppercase tracking-wider">
                  Select Wallet
                </div>
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      selectWallet(w.id);
                      setWalletDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors ${
                      w.id === activeWalletId
                        ? "bg-accent/15 text-accent font-medium"
                        : "text-fg hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-xs truncate">{w.name}</span>
                      <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-surface-2 text-fg-subtle uppercase border border-line">
                        {w.type}
                      </span>
                    </div>
                    {w.id === activeWalletId && <Check size={14} className="text-accent shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Primary Navigation */}
        <nav className="mt-5 flex-1 flex flex-col gap-1">
          <div className="px-2 pb-1.5 text-[10px] font-mono tracking-wider text-fg-subtle uppercase">
            Platform
          </div>
          {navLinks.map((link) => {
            const isActive = pathname === link.path || (link.path === "/vault" && pathname === "/");
            const Icon = link.icon;
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`relative flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                  isActive
                    ? "bg-surface-2 text-accent border border-accent/25 shadow-[0_0_15px_-4px_rgb(var(--c-accent)/0.25)]"
                    : "text-fg-muted hover:bg-surface-2/60 hover:text-fg"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    size={16}
                    className={`transition-colors ${
                      isActive ? "text-accent" : "text-fg-subtle group-hover:text-fg"
                    }`}
                  />
                  <span>{link.name}</span>
                </div>
                {link.badge && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-fg-subtle border border-line">
                    {link.badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Security & Cryptographic Posture Badge */}
        <div className="p-3 rounded-xl bg-surface-2/40 border border-line mb-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-fg">
            <KeyRound className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>Local Key Active</span>
          </div>
          <p className="text-[10px] text-fg-subtle mt-1 leading-normal font-mono">
            AES-256-GCM / Argon2id. Master key lives solely in browser RAM.
          </p>
        </div>

        {/* Bottom User Controls */}
        <div className="pt-3 border-t border-line flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="truncate text-[11px] text-fg-subtle font-mono truncate max-w-[170px]" title={email || ""}>
              {email}
            </div>
            <button
              onClick={toggleTheme}
              aria-label="Toggle visual theme"
              className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors border border-transparent hover:border-line"
              title="Toggle theme"
            >
              {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-xs font-medium text-danger hover:brightness-125 transition-all py-1.5 px-2 rounded-lg hover:bg-danger/10"
          >
            <LogOut size={14} /> Lock & Sign Out
          </button>
        </div>
      </aside>

      {/* ── MOBILE SLIDE-OVER DRAWER ─────────────────────────────────────── */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-canvas/80 backdrop-blur-md animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-surface border-r border-line p-5 flex flex-col z-10 animate-slide-in-left">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface-2 border border-accent/40 text-accent flex items-center justify-center">
                  <Shield size={18} />
                </div>
                <span className="font-display font-bold text-sm tracking-tight text-fg">
                  SENTINEL<span className="text-accent font-medium ml-1">VAULT</span>
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-fg-subtle hover:text-fg rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="mt-4 flex-1 flex flex-col gap-1.5 overflow-y-auto">
              {navLinks.map((link) => {
                const isActive = pathname === link.path;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.path}
                    href={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-accent/15 text-accent border border-accent/30 font-semibold"
                        : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} />
                      <span>{link.name}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-line flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-subtle truncate max-w-[180px]">{email}</span>
                <button
                  onClick={toggleTheme}
                  className="p-1.5 rounded-lg border border-line text-fg-muted hover:text-fg"
                >
                  {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
                </button>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 text-xs font-medium text-danger bg-danger/10 py-2 rounded-lg"
              >
                <LogOut size={14} /> Lock Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ───────────────────────────────────────────── */}
      <div className="flex-1 md:ml-[260px] flex flex-col min-h-screen">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 h-16 px-4 md:px-8 bg-surface/75 backdrop-blur-xl border-b border-line flex items-center justify-between shrink-0">
          {/* Mobile hamburger & Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile navigation menu"
              className="md:hidden p-2 rounded-lg border border-line bg-surface text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
            >
              <Menu size={18} />
            </button>
            <div>
              <h1 className="font-display text-base md:text-lg font-bold text-fg leading-none tracking-tight">
                {pageTitle}
              </h1>
              <div className="text-[11px] text-fg-subtle font-mono mt-1 hidden sm:block">
                <span>Wallet: </span>
                <span className="text-accent">{activeWallet?.name || "Main Vault"}</span>
                <span className="mx-2 text-line">•</span>
                <span className="text-lime">Zero-Knowledge Active</span>
              </div>
            </div>
          </div>

          {/* Header Actions & Quick Search */}
          <div className="flex items-center gap-2.5">
            {/* Global search / Cmd+K pill button */}
            <button
              onClick={() => setCmdPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-surface-2/60 text-xs text-fg-subtle hover:border-line-strong hover:text-fg transition-colors"
            >
              <Search size={14} className="text-accent" />
              <span>Search vault...</span>
              <span className="kbd text-[10px] ml-1">⌘K</span>
            </button>

            {/* Quick Mobile search icon */}
            <button
              onClick={() => setCmdPaletteOpen(true)}
              className="sm:hidden p-2 rounded-lg border border-line bg-surface-2/60 text-fg-muted hover:text-fg"
              aria-label="Search Vault"
            >
              <Search size={16} />
            </button>

            {/* Injected Header Actions (e.g. "+ New Credential" or search input) */}
            {headerActions}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onNewCredential={onNewCredential}
        items={vaultItemsForSearch}
        onSelectItem={onSelectSearchItem}
      />
    </div>
  );
}
