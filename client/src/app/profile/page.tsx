"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearTokens } from "@/lib/api";
import { useVault } from "@/context/VaultContext";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/AppShell";
import { 
  User, 
  Lock, 
  ShieldCheck, 
  Key, 
  Info, 
  LogOut, 
  Wallet as WalletIcon, 
  Layers, 
  KeyRound,
  Shield,
  Clock,
  Sparkles
} from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();
  const { vaultKey, email, clearSession, wallets } = useVault();
  const [sessionCount, setSessionCount] = useState<number>(1);
  const [passkeyCount, setPasskeyCount] = useState<number>(0);
  const [mfaActive, setMfaActive] = useState<boolean>(false);

  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
      return;
    }
    void loadStats();
  }, [vaultKey, router]);

  async function loadStats() {
    try {
      const [sessRes, pkRes, mfaRes] = await Promise.allSettled([
        api.get("/auth/sessions"),
        api.get("/auth/passkeys"),
        api.get("/auth/mfa/status"),
      ]);
      if (sessRes.status === "fulfilled" && sessRes.value.ok) {
        const data = await sessRes.value.json();
        if (Array.isArray(data)) setSessionCount(data.length);
      }
      if (pkRes.status === "fulfilled" && pkRes.value.ok) {
        const data = await pkRes.value.json();
        if (Array.isArray(data)) setPasskeyCount(data.length);
      }
      if (mfaRes.status === "fulfilled" && mfaRes.value.ok) {
        const data = await mfaRes.value.json();
        setMfaActive(Boolean(data.mfaEnabled));
      }
    } catch {
      // ignore
    }
  }

  if (!vaultKey) return null;

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore
    }
    clearTokens();
    clearSession();
    router.push("/login");
  }

  return (
    <AppShell pageTitle="Profile & Cryptographic Identity">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile Identity Card */}
        <div className="panel p-6 sm:p-8 bg-gradient-to-r from-surface-2/60 via-surface to-surface-2/40 border-line relative overflow-hidden flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-20 h-20 rounded-2xl bg-surface-2 border border-accent/40 text-accent flex items-center justify-center font-display text-2xl font-bold shrink-0 shadow-[0_0_25px_-5px_rgb(var(--c-accent)/0.35)]">
            {email ? email.substring(0, 2).toUpperCase() : "SV"}
          </div>

          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="eyebrow flex items-center justify-center sm:justify-start gap-1.5 mb-1.5">
              <ShieldCheck size={14} className="text-lime" />
              <span>Zero-Knowledge Identity</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-fg truncate">
              {email}
            </h2>
            <p className="text-xs text-fg-muted mt-1 leading-relaxed">
              Master Encryption Key derived locally with Argon2id. Your vault is cryptographically isolated.
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase bg-lime/12 text-lime border border-lime/30">
                <ShieldCheck size={12} />
                Client-Side E2EE
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase bg-accent/12 text-accent border border-accent/30">
                <KeyRound size={12} />
                Vault Key Active
              </span>
              {mfaActive && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase bg-uv/12 text-uv border border-uv/30">
                  TOTP 2FA Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Identity & Key Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="panel p-4 bg-surface-2/30">
            <div className="flex justify-between items-center text-xs text-fg-subtle mb-2">
              <span className="font-mono text-[10px] uppercase">Connected Wallets</span>
              <WalletIcon size={16} className="text-accent" />
            </div>
            <div className="font-display text-2xl font-bold text-fg">{wallets.length}</div>
            <p className="text-[11px] text-fg-subtle mt-1 font-mono">
              Partitioned vault namespaces
            </p>
          </div>

          <div className="panel p-4 bg-surface-2/30">
            <div className="flex justify-between items-center text-xs text-fg-subtle mb-2">
              <span className="font-mono text-[10px] uppercase">Registered Passkeys</span>
              <Key size={16} className="text-uv" />
            </div>
            <div className="font-display text-2xl font-bold text-fg">{passkeyCount}</div>
            <p className="text-[11px] text-fg-subtle mt-1 font-mono">
              FIDO2 / WebAuthn devices
            </p>
          </div>

          <div className="panel p-4 bg-surface-2/30">
            <div className="flex justify-between items-center text-xs text-fg-subtle mb-2">
              <span className="font-mono text-[10px] uppercase">Active Sessions</span>
              <Clock size={16} className="text-lime" />
            </div>
            <div className="font-display text-2xl font-bold text-fg">{sessionCount}</div>
            <p className="text-[11px] text-fg-subtle mt-1 font-mono">
              Authorized client instances
            </p>
          </div>
        </div>

        {/* Cryptographic Key Architecture Explanation */}
        <div className="panel p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-line">
            <KeyRound size={18} className="text-accent" />
            <h3 className="font-display text-sm font-bold text-fg">
              Master Password & Cryptographic Isolation
            </h3>
          </div>

          <div className="p-4 rounded-xl bg-accent/10 border border-accent/25 flex items-start gap-3">
            <Info size={18} className="text-accent shrink-0 mt-0.5" />
            <div className="text-xs text-fg leading-relaxed">
              <p className="font-semibold text-accent mb-1 font-mono">
                Your Master Password is never transmitted to any server.
              </p>
              When you authenticate, the client performs memory-hard Argon2id key derivation to calculate your Master Encryption Key (MEK) and an authentication hash. Sentinel Vault servers only store the authentication hash and ciphertext. If your master password is lost, recovery without pre-generated recovery codes is mathematically impossible.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div>
              <div className="text-xs font-semibold text-fg">Security & Recovery Keys</div>
              <div className="text-xs text-fg-muted mt-0.5">
                Manage hardware keys, TOTP authenticators, and emergency recovery codes.
              </div>
            </div>
            <Link href="/settings/security">
              <Button variant="secondary" size="sm">
                Open Security Center
              </Button>
            </Link>
          </div>
        </div>

        {/* Danger Zone: Device Logout */}
        <div className="panel p-6 border-danger/35 bg-danger/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-display text-sm font-bold text-danger">Lock Device & Session</h4>
              <p className="text-xs text-fg-muted mt-0.5">
                Revoke your current access token, purge the Master Encryption Key from memory, and return to login.
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={handleLogout} className="shrink-0">
              <LogOut size={14} className="mr-1.5" />
              <span>Lock Vault & Sign Out</span>
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
