"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVault } from "@/context/VaultContext";
import { ActiveSessions } from "@/components/ActiveSessions";
import { MfaSettings } from "@/components/MfaSettings";
import { PasskeySettings } from "@/components/PasskeySettings";
import { RecoveryCodeSettings } from "@/components/RecoveryCodeSettings";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { vaultKey, email } = useVault();

  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
    }
  }, [vaultKey, router]);

  if (!vaultKey) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 border-r border-border/50 bg-surface flex-shrink-0 flex flex-col sticky top-0 md:h-screen">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">Vault</span>
          </div>
          <div className="text-sm font-medium text-foreground truncate">{email}</div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="mb-6">
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Vault</h3>
            <div className="space-y-1">
              <Link href="/vault" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                All Items
              </Link>
              <Link href="/health" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                Security Health
              </Link>
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Security</h3>
            <div className="space-y-1">
              <Link href="/settings/security" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-accent/10 text-accent font-medium transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Security Settings
              </Link>
              <Link href="/audit" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                Audit Log
              </Link>
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Enterprise</h3>
            <div className="space-y-1">
              <Link href="/enterprise" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                Enterprise
              </Link>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-8 py-6 border-b border-border/50 bg-surface/50 sticky top-0 z-10 backdrop-blur-md">
          <h1 className="text-2xl font-bold tracking-tight">Security Settings</h1>
          <p className="text-sm text-foreground/50 mt-0.5">Manage session security, devices, and authentication preferences.</p>
        </header>

        <div className="flex-1 p-8 max-w-4xl space-y-8">
          <PasskeySettings />
          <MfaSettings />
          <RecoveryCodeSettings />
          <ActiveSessions />
        </div>
      </main>
    </div>
  );
}
