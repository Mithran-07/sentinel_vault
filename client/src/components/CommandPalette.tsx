"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, 
  Lock, 
  Trash2, 
  ShieldCheck, 
  ClipboardList, 
  Building2, 
  User, 
  Plus, 
  Sun, 
  Moon, 
  LogOut, 
  ArrowRight,
  Sparkles
} from "lucide-react";

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNewCredential?: () => void;
  items?: Array<{ id: string; name: string; username?: string; type?: string }>;
  onSelectItem?: (id: string) => void;
}

interface PaletteEntry {
  id: string;
  label: string;
  sublabel?: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  badge?: string;
  run: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onNewCredential,
  items = [],
  onSelectItem,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains("dark");
    if (isDark) {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      localStorage.setItem("sv-theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      localStorage.setItem("sv-theme", "dark");
    }
  };

  const navActions = [
    { id: "nav-vault", label: "Go to Vault", category: "Navigation", icon: Lock, run: () => router.push("/vault") },
    { id: "nav-security", label: "Security Health Center", category: "Navigation", icon: ShieldCheck, run: () => router.push("/settings/security") },
    { id: "nav-trash", label: "Trash & Recovery", category: "Navigation", icon: Trash2, run: () => router.push("/trash") },
    { id: "nav-audit", label: "Audit Event Log", category: "Navigation", icon: ClipboardList, run: () => router.push("/audit") },
    { id: "nav-enterprise", label: "Enterprise & Organizations", category: "Navigation", icon: Building2, run: () => router.push("/enterprise") },
    { id: "nav-profile", label: "Profile & Authentication", category: "Navigation", icon: User, run: () => router.push("/profile") },
  ];

  const quickActions = [
    {
      id: "act-new",
      label: "New Credential",
      category: "Actions",
      icon: Plus,
      badge: "Ctrl+N",
      run: () => {
        if (onNewCredential) onNewCredential();
      },
    },
    {
      id: "act-theme",
      label: "Toggle Theme (Dark / Light)",
      category: "Actions",
      icon: Sun,
      run: () => toggleTheme(),
    },
    {
      id: "act-logout",
      label: "Lock Vault & Sign Out",
      category: "Actions",
      icon: LogOut,
      destructive: true,
      run: () => {
        router.push("/login");
      },
    },
  ];

  const filteredItems = items
    .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()) || (i.username && i.username.toLowerCase().includes(query.toLowerCase())))
    .slice(0, 5)
    .map((i) => ({
      id: `item-${i.id}`,
      label: i.name,
      sublabel: i.username || i.type || "Credential",
      category: "Vault Items",
      icon: Lock,
      run: () => {
        if (onSelectItem) onSelectItem(i.id);
      },
    }));

  const filteredNav = navActions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));
  const filteredQuick = quickActions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));

  const allEntries: PaletteEntry[] = [...filteredItems, ...filteredQuick, ...filteredNav];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (allEntries.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allEntries.length) % (allEntries.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = allEntries[selectedIndex];
        if (selected) {
          selected.run();
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, allEntries, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-20 p-4 bg-canvas/80 backdrop-blur-md animate-fade-in"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-surface border border-line rounded-2xl shadow-pop w-full max-w-xl overflow-hidden z-10 flex flex-col animate-pop-in">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-line bg-surface-2/40">
          <Search className="w-5 h-5 text-accent mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search credentials, navigate, or run commands..."
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <span className="kbd text-[11px] ml-2 shrink-0">ESC</span>
        </div>

        {/* Results List */}
        <div className="max-h-[360px] overflow-y-auto p-2 space-y-1">
          {allEntries.length === 0 ? (
            <div className="p-8 text-center text-fg-subtle text-xs">
              No matching credentials or commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            allEntries.map((entry, idx) => {
              const Icon = entry.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={entry.id}
                  onClick={() => {
                    entry.run();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-colors ${
                    isSelected ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-surface-2 text-fg-subtle border-line"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="text-xs font-medium text-fg truncate flex items-center gap-2">
                        <span>{entry.label}</span>
                        {entry.category === "Vault Items" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">
                            Decrypted
                          </span>
                        )}
                      </div>
                      {entry.sublabel && (
                        <div className="text-[11px] text-fg-subtle truncate">{entry.sublabel}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] font-mono text-fg-subtle uppercase tracking-wider">
                      {entry.category}
                    </span>
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-accent" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 border-t border-line bg-surface-2/30 flex items-center justify-between text-[11px] text-fg-subtle">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="kbd text-[9px]">↑</span>
              <span className="kbd text-[9px]">↓</span> to navigate
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd text-[9px]">↵</span> to select
            </span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-accent">
            <Sparkles className="w-3 h-3 text-accent" /> Zero-Knowledge Search
          </div>
        </div>
      </div>
    </div>
  );
}
