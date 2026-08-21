"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/context/VaultContext";
import { ActiveSessions } from "@/components/ActiveSessions";
import { MfaSettings } from "@/components/MfaSettings";
import { PasskeySettings } from "@/components/PasskeySettings";
import { RecoveryCodeSettings } from "@/components/RecoveryCodeSettings";
import { AppShell } from "@/components/AppShell";

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
    <AppShell pageTitle="Security Health">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <p className="text-[14px] text-slate-500 mt-2">Monitor and manage your account's security posture.</p>
        </div>

        {/* Top Score Card */}
        <div className="bg-surface rounded-xl p-[28px] border border-border-light shadow-sm mb-6 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-shrink-0 w-48 relative">
            <svg className="w-full text-success" viewBox="0 0 36 36">
              <path 
                className="text-success/10 stroke-current" 
                fill="none"
                strokeWidth="2"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
              />
              <path 
                className="stroke-current" 
                fill="none"
                strokeWidth="2"
                strokeDasharray="78, 100"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[32px] font-bold text-slate-800 tracking-tight leading-none">78</span>
              <span className="text-[12px] font-semibold tracking-wider text-slate-500 uppercase mt-1">/100</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-[18px] font-semibold text-slate-800">Overall Security Score</h3>
              <span className="bg-success-bg text-success-text text-[12px] font-semibold tracking-wider px-3 py-1 rounded-full uppercase">Good</span>
            </div>
            <p className="text-[14px] text-slate-600 mb-6 max-w-xl">
              Your account is well protected, but there are a few recommended actions to reach maximum security.
            </p>
            <button className="bg-white border-[1.5px] border-border-light text-slate-700 text-[14px] font-medium px-4 py-2 rounded-lg hover:border-primary hover:text-primary transition-all">
              View Recommendations
            </button>
          </div>
        </div>

        {/* Existing Settings Components */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface rounded-xl p-[28px] border border-border-light shadow-sm">
            <PasskeySettings />
          </div>
          <div className="bg-surface rounded-xl p-[28px] border border-border-light shadow-sm">
            <MfaSettings />
          </div>
          <div className="bg-surface rounded-xl p-[28px] border border-border-light shadow-sm">
            <RecoveryCodeSettings />
          </div>
          <div className="bg-surface rounded-xl p-[28px] border border-border-light shadow-sm md:col-span-2">
            <ActiveSessions />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
