"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deriveMasterKey, deriveAuthHash, decryptVaultKey } from "@/lib/crypto";
import { api, setTokens } from "@/lib/api";
import { useVault } from "@/context/VaultContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useVault();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA 2-Step Challenge State
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [savedMasterKey, setSavedMasterKey] = useState<Uint8Array | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const kdfRes = await fetch(`${API_BASE}/auth/kdf?email=${encodeURIComponent(email)}`);
      if (!kdfRes.ok) {
        throw new Error("Invalid credentials");
      }
      const kdf = await kdfRes.json();

      const masterKey = await deriveMasterKey(password, {
        saltHex: kdf.salt,
        memoryKb: kdf.memoryKb,
        iterations: kdf.iterations,
        parallelism: kdf.parallelism,
      });
      const authHash = await deriveAuthHash(masterKey);

      const res = await api.post("/auth/login", { email, authHash });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Login failed");
      }
      const data = await res.json();

      // Check if MFA is required for this account
      if (data.mfaRequired && data.mfaToken) {
        setMfaRequired(true);
        setMfaToken(data.mfaToken);
        setSavedMasterKey(masterKey);
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      const vaultKey = await decryptVaultKey(data.encryptedVaultKey, masterKey);
      setSession(vaultKey, email);
      router.push("/vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken || !savedMasterKey) return;

    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/auth/mfa/totp/authenticate", {
        mfaToken,
        code: totpCode,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "MFA verification failed");
      }

      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      const vaultKey = await decryptVaultKey(data.encryptedVaultKey, savedMasterKey);
      setSession(vaultKey, email);
      router.push("/vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-6 shadow-lg shadow-accent/20">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {mfaRequired ? "Two-Factor Authentication" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            {mfaRequired ? "Enter 6-digit code from your authenticator app" : "Unlock your zero-knowledge vault"}
          </p>
        </div>

        {!mfaRequired ? (
          <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-border/50 bg-surface p-8 shadow-xl">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/40 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                placeholder="name@example.com"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">Master Password</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/40 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                placeholder="••••••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-500 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              disabled={busy}
              className="w-full rounded-lg bg-accent py-3 font-medium text-white shadow-sm hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-2"
            >
              {busy ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Deriving key...</span>
                </>
              ) : (
                "Unlock Vault"
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={onMfaSubmit} className="space-y-5 rounded-2xl border border-border/50 bg-surface p-8 shadow-xl">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">Authenticator Code</label>
              <input
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                className="w-full text-center text-2xl tracking-widest font-mono rounded-lg border border-border bg-background py-3 text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-500 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              disabled={busy || totpCode.length !== 6}
              className="w-full rounded-lg bg-accent py-3 font-medium text-white shadow-sm hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-2"
            >
              {busy ? "Verifying TOTP..." : "Verify & Unlock"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMfaRequired(false);
                setMfaToken(null);
                setSavedMasterKey(null);
                setTotpCode("");
                setError(null);
              }}
              className="w-full text-xs text-foreground/50 hover:text-foreground text-center pt-2 transition-colors"
            >
              ← Back to Login
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-foreground/60">
          Don't have a vault yet?{" "}
          <Link href="/register" className="font-medium text-accent hover:text-accent-hover transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
