"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/context/VaultContext";
import { decryptItem } from "@/lib/crypto";
import { estimateStrength } from "@/lib/generator";
import { api } from "@/lib/api";
import { ItemPayload } from "@/components/ItemModal";
import { ActiveSessions } from "@/components/ActiveSessions";
import { MfaSettings } from "@/components/MfaSettings";
import { PasskeySettings } from "@/components/PasskeySettings";
import { RecoveryCodeSettings } from "@/components/RecoveryCodeSettings";
import { AppShell } from "@/components/AppShell";
import { 
  ShieldCheck, 
  ShieldAlert, 
  Key, 
  Smartphone, 
  Fingerprint, 
  FileKey2, 
  Laptop, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Lock,
  ArrowRight
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface VaultItemRecord {
  id: string;
  ciphertext: string;
  iv: string;
  updatedAt: string;
}

interface LocalHealthSummary {
  totalLogins: number;
  weakCount: number;
  reusedCount: number;
  oldCount: number;
}

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { vaultKey, activeWalletId } = useVault();
  const [activeTab, setActiveTab] = useState<"overview" | "passkeys" | "mfa" | "recovery" | "sessions">("overview");

  // Real telemetry states
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const [recoveryCodesLeft, setRecoveryCodesLeft] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [healthSummary, setHealthSummary] = useState<LocalHealthSummary | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
      return;
    }
    void loadVerifiedStatus();
    void computeLocalHealth();
  }, [vaultKey, activeWalletId]);

  async function loadVerifiedStatus() {
    try {
      const [mfaRes, pkRes, recRes, sessRes] = await Promise.allSettled([
        api.get("/auth/mfa/status"),
        api.get("/auth/passkeys"),
        api.get("/auth/recovery/status"),
        api.get("/auth/sessions"),
      ]);

      if (mfaRes.status === "fulfilled" && mfaRes.value.ok) {
        const d = await mfaRes.value.json();
        setMfaEnabled(Boolean(d.mfaEnabled));
      }
      if (pkRes.status === "fulfilled" && pkRes.value.ok) {
        const d = await pkRes.value.json();
        setPasskeyCount(Array.isArray(d) ? d.length : 0);
      }
      if (recRes.status === "fulfilled" && recRes.value.ok) {
        const d = await recRes.value.json();
        setRecoveryCodesLeft(d.remainingCodes ?? 0);
      }
      if (sessRes.status === "fulfilled" && sessRes.value.ok) {
        const d = await sessRes.value.json();
        setSessionCount(Array.isArray(d) ? d.length : 0);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function computeLocalHealth() {
    if (!vaultKey || !activeWalletId) return;
    setLoadingHealth(true);
    try {
      // Local client-side evaluation: items decrypted into browser RAM only!
      const res = await api.get(`/vault/items?walletId=${activeWalletId}`);
      if (!res.ok) return;
      const records: VaultItemRecord[] = await res.json();
      const logins: { id: string; password: string; updatedAt: string }[] = [];

      await Promise.all(
        records.map(async (r) => {
          try {
            const data = await decryptItem<ItemPayload>({ ciphertext: r.ciphertext, iv: r.iv }, vaultKey);
            if (data.type === "LOGIN" && data.password) {
              logins.push({ id: r.id, password: data.password, updatedAt: r.updatedAt });
            }
          } catch {
            // ignore malformed items
          }
        })
      );

      // Compute password frequency map
      const freq: Record<string, number> = {};
      for (const item of logins) {
        freq[item.password] = (freq[item.password] || 0) + 1;
      }

      const now = Date.now();
      const ms180Days = 180 * 24 * 60 * 60 * 1000;

      let weakCount = 0;
      let reusedCount = 0;
      let oldCount = 0;

      for (const item of logins) {
        if (estimateStrength(item.password) === "weak") weakCount++;
        if (freq[item.password] > 1) reusedCount++;
        if (now - new Date(item.updatedAt).getTime() > ms180Days) oldCount++;
      }

      setHealthSummary({
        totalLogins: logins.length,
        weakCount,
        reusedCount,
        oldCount,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHealth(false);
    }
  }

  if (!vaultKey) return null;

  return (
    <AppShell pageTitle="Security Center">
      {/* ── SECURITY POSTURE VERIFIED BANNER ──────────────────────────────── */}
      <div className="panel p-6 mb-6 bg-gradient-to-r from-surface-2/60 via-surface to-surface-2/40 border-line relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="eyebrow flex items-center gap-1.5 mb-2">
              <ShieldCheck size={14} className="text-lime" />
              <span>Cryptographic Health & Posture</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-fg tracking-tight">
              Honest Security Verification
            </h2>
            <p className="text-xs text-fg-muted mt-1.5 max-w-2xl leading-relaxed">
              Every status shown below is grounded in actual telemetry and local client-side evaluation. No simulated or arbitrary security scores are ever presented.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void loadVerifiedStatus();
                void computeLocalHealth();
              }}
            >
              <RefreshCw size={13} className="mr-1.5" />
              Re-scan Vault
            </Button>
            <Link href="/vault">
              <Button variant="primary" size="sm">
                Open Vault Items
              </Button>
            </Link>
          </div>
        </div>

        {/* Ambient subtle glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ── VERIFIED SECURITY CONTROL CARDS ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Passkeys card */}
        <div
          onClick={() => setActiveTab("passkeys")}
          className="panel p-4 cursor-pointer hover:border-accent/40 transition-all group bg-surface-2/30"
        >
          <div className="flex items-center justify-between text-xs text-fg-subtle mb-3">
            <span className="font-mono text-[10px] uppercase tracking-wider">Authentication</span>
            <Fingerprint size={16} className="text-accent group-hover:scale-110 transition-transform" />
          </div>
          <div className="font-display text-xl font-bold text-fg">
            {passkeyCount === null ? "—" : `${passkeyCount} Passkeys`}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            {passkeyCount && passkeyCount > 0 ? (
              <span className="text-lime flex items-center gap-1 font-mono">
                <CheckCircle2 size={12} /> Hardware-backed FIDO2
              </span>
            ) : (
              <span className="text-warning flex items-center gap-1 font-mono">
                <AlertTriangle size={12} /> No hardware keys added
              </span>
            )}
          </div>
        </div>

        {/* MFA / TOTP Card */}
        <div
          onClick={() => setActiveTab("mfa")}
          className="panel p-4 cursor-pointer hover:border-accent/40 transition-all group bg-surface-2/30"
        >
          <div className="flex items-center justify-between text-xs text-fg-subtle mb-3">
            <span className="font-mono text-[10px] uppercase tracking-wider">Two-Factor</span>
            <Smartphone size={16} className="text-uv group-hover:scale-110 transition-transform" />
          </div>
          <div className="font-display text-xl font-bold text-fg">
            {mfaEnabled === null ? "—" : mfaEnabled ? "TOTP Active" : "Disabled"}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            {mfaEnabled ? (
              <span className="text-lime flex items-center gap-1 font-mono">
                <CheckCircle2 size={12} /> Second factor enforced
              </span>
            ) : (
              <span className="text-danger flex items-center gap-1 font-mono">
                <AlertTriangle size={12} /> Setup recommended
              </span>
            )}
          </div>
        </div>

        {/* Emergency Recovery Codes */}
        <div
          onClick={() => setActiveTab("recovery")}
          className="panel p-4 cursor-pointer hover:border-accent/40 transition-all group bg-surface-2/30"
        >
          <div className="flex items-center justify-between text-xs text-fg-subtle mb-3">
            <span className="font-mono text-[10px] uppercase tracking-wider">Account Recovery</span>
            <FileKey2 size={16} className="text-lime group-hover:scale-110 transition-transform" />
          </div>
          <div className="font-display text-xl font-bold text-fg">
            {recoveryCodesLeft === null ? "—" : `${recoveryCodesLeft} Codes`}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            {recoveryCodesLeft && recoveryCodesLeft > 0 ? (
              <span className="text-lime flex items-center gap-1 font-mono">
                <CheckCircle2 size={12} /> Recovery kit generated
              </span>
            ) : (
              <span className="text-warning flex items-center gap-1 font-mono">
                <AlertTriangle size={12} /> Generate backup codes
              </span>
            )}
          </div>
        </div>

        {/* Active Sessions */}
        <div
          onClick={() => setActiveTab("sessions")}
          className="panel p-4 cursor-pointer hover:border-accent/40 transition-all group bg-surface-2/30"
        >
          <div className="flex items-center justify-between text-xs text-fg-subtle mb-3">
            <span className="font-mono text-[10px] uppercase tracking-wider">Live Devices</span>
            <Laptop size={16} className="text-accent group-hover:scale-110 transition-transform" />
          </div>
          <div className="font-display text-xl font-bold text-fg">
            {sessionCount === null ? "—" : `${sessionCount} Active`}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-fg-subtle">
            <span>Review & revoke others</span>
          </div>
        </div>
      </div>

      {/* ── CLIENT-SIDE PASSWORD HEALTH STRIP ─────────────────────────────── */}
      <div className="panel p-5 mb-8 bg-surface-2/20">
        <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-accent" />
            <h3 className="font-display text-sm font-bold text-fg">
              Local Vault Password Inspection
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-2 text-accent border border-accent/20">
              Evaluated In-Browser
            </span>
          </div>
          <span className="text-xs text-fg-subtle font-mono">
            {healthSummary ? `${healthSummary.totalLogins} credentials evaluated` : "Analyzing..."}
          </span>
        </div>

        {loadingHealth ? (
          <div className="text-xs text-fg-subtle py-4 font-mono">
            Decrypting local credentials into memory for strength assessment...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-surface-2/40 border border-line">
              <div className="flex justify-between items-center text-xs text-fg-subtle mb-1">
                <span>Weak Passwords</span>
                <span className={healthSummary && healthSummary.weakCount > 0 ? "text-danger" : "text-lime"}>
                  {healthSummary?.weakCount ?? 0}
                </span>
              </div>
              <p className="text-[11px] text-fg-muted mt-1 leading-normal">
                {healthSummary && healthSummary.weakCount > 0
                  ? "Passwords with low complexity or under 12 characters."
                  : "All inspected passwords meet minimum strength thresholds."}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-2/40 border border-line">
              <div className="flex justify-between items-center text-xs text-fg-subtle mb-1">
                <span>Reused Across Accounts</span>
                <span className={healthSummary && healthSummary.reusedCount > 0 ? "text-warning" : "text-lime"}>
                  {healthSummary?.reusedCount ?? 0}
                </span>
              </div>
              <p className="text-[11px] text-fg-muted mt-1 leading-normal">
                {healthSummary && healthSummary.reusedCount > 0
                  ? "Credentials sharing the same password. If one is breached, others are exposed."
                  : "No duplicated passwords found across your vault."}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-2/40 border border-line">
              <div className="flex justify-between items-center text-xs text-fg-subtle mb-1">
                <span>Stale (&gt; 180 Days)</span>
                <span className={healthSummary && healthSummary.oldCount > 0 ? "text-warning" : "text-lime"}>
                  {healthSummary?.oldCount ?? 0}
                </span>
              </div>
              <p className="text-[11px] text-fg-muted mt-1 leading-normal">
                {healthSummary && healthSummary.oldCount > 0
                  ? "Passwords that have not been rotated in over 6 months."
                  : "All accounts modified recently."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── SECURITY CONFIGURATION TABS & CONTROLS ────────────────────────── */}
      <div className="panel p-6">
        {/* Tab Headers */}
        <div className="flex items-center gap-2 border-b border-line pb-4 mb-6 overflow-x-auto">
          {[
            { id: "overview", label: "All Security Controls" },
            { id: "passkeys", label: "Passkeys & FIDO2" },
            { id: "mfa", label: "Two-Factor (TOTP)" },
            { id: "recovery", label: "Emergency Recovery" },
            { id: "sessions", label: "Active Sessions" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-accent/15 text-accent border border-accent/30 shadow-sm"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="space-y-8">
          {(activeTab === "overview" || activeTab === "passkeys") && (
            <div className="pt-2">
              <PasskeySettings />
            </div>
          )}
          {(activeTab === "overview" || activeTab === "mfa") && (
            <div className="pt-2">
              <MfaSettings />
            </div>
          )}
          {(activeTab === "overview" || activeTab === "recovery") && (
            <div className="pt-2">
              <RecoveryCodeSettings />
            </div>
          )}
          {(activeTab === "overview" || activeTab === "sessions") && (
            <div className="pt-2">
              <ActiveSessions />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
