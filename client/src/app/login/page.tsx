"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deriveMasterKey, deriveAuthHash, decryptVaultKey } from "@/lib/crypto";
import { api, setTokens } from "@/lib/api";
import { useVault } from "@/context/VaultContext";
import { Shield, Mail, Lock, Eye, EyeOff, ArrowRight, Building, KeyRound, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useVault();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setStatusMessage("Deriving keys locally (Argon2id)...");

    try {
      // Step 1: Fetch KDF params for email
      const kdfRes = await fetch(`${API_BASE}/auth/kdf?email=${encodeURIComponent(email)}`);
      if (!kdfRes.ok) {
        throw new Error("Invalid account email or master password.");
      }
      const kdf = await kdfRes.json();

      // Step 2: Client-side Argon2id key derivation
      const masterKey = await deriveMasterKey(password, {
        saltHex: kdf.salt,
        memoryKb: kdf.memoryKb,
        iterations: kdf.iterations,
        parallelism: kdf.parallelism,
      });

      setStatusMessage("Authenticating with server...");
      const authHash = await deriveAuthHash(masterKey);

      // Step 3: Server authentication with AuthHash (MEK never sent)
      const res = await api.post("/auth/login", { email, authHash });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Authentication failed.");
      }
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);

      setStatusMessage("Unlocking vault encryption key...");
      const vaultKey = await decryptVaultKey(data.encryptedVaultKey, masterKey);
      setSession(vaultKey, email);

      router.push("/vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
      setStatusMessage(null);
    }
  }

  return (
    <div className="bg-canvas text-fg min-h-screen flex flex-col relative overflow-x-hidden selection:bg-accent/20">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 subtle-grid opacity-50 pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <Link href="/" className="flex items-center gap-2.5 text-fg hover:opacity-90 transition-opacity">
          <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-accent shadow-xs">
            <Shield size={17} className="fill-accent/20" />
          </div>
          <span className="font-display font-bold text-sm tracking-tight">Sentinel Vault</span>
        </Link>
        <div className="flex items-center gap-2.5 text-2xs text-fg-muted font-mono">
          <span>Need an account?</span>
          <Link href="/register">
            <Button variant="secondary" size="xs">
              Create Vault
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center p-4 relative z-10 my-auto">
        <div className="w-full max-w-[400px] bg-surface rounded-xl border border-line shadow-popover p-7 flex flex-col">
          
          {/* Card Header */}
          <div className="text-center mb-6">
            <div className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center mx-auto mb-3 text-accent shadow-xs">
              <KeyRound size={18} />
            </div>
            <h1 className="text-xl font-bold font-display text-fg tracking-tight">Unlock Your Vault</h1>
            <p className="text-2xs text-fg-muted mt-1 font-mono">Zero-knowledge client-side decryption</p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-start gap-2.5 text-xs text-danger">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* Form */}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <Input
                label="Account Email"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                icon={<Mail size={16} />}
                disabled={busy}
              />
            </div>

            <div>
              <div className="relative">
                <Input
                  label="Master Password"
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  icon={<Lock size={16} />}
                  className="pr-10 font-mono text-xs"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-[28px] text-fg-subtle hover:text-fg transition-colors focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={busy}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <Button
                type="submit"
                variant="primary"
                className="w-full h-9 text-xs font-medium"
                isLoading={busy}
              >
                {!busy && (
                  <>
                    <span>Unlock Vault</span>
                    <ArrowRight size={14} className="ml-1.5" />
                  </>
                )}
              </Button>

              {statusMessage && (
                <p className="text-center text-2xs font-mono text-accent animate-pulse">
                  {statusMessage}
                </p>
              )}

              <div className="relative flex items-center py-1.5">
                <div className="flex-grow border-t border-line" />
                <span className="flex-shrink-0 mx-3 text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
                  Enterprise
                </span>
                <div className="flex-grow border-t border-line" />
              </div>

              <Link href="/enterprise/login" className="block w-full">
                <Button variant="secondary" size="sm" className="w-full h-8 text-2xs gap-1.5">
                  <Building size={14} className="text-uv" />
                  <span>Enterprise SSO Login (SAML 2.0 / OIDC)</span>
                </Button>
              </Link>
            </div>
          </form>

          {/* Cryptographic Privacy Notice */}
          <div className="mt-5 pt-3.5 border-t border-line flex items-start gap-2 text-[10px] text-fg-subtle leading-relaxed font-mono">
            <Lock size={12} className="text-accent shrink-0 mt-0.5" />
            <p>
              <strong className="text-fg-muted">RAM Isolation:</strong> Keys are derived in your local browser session via Argon2id. The master password never traverses the network.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-2xs font-mono text-fg-subtle relative z-10">
        <p>AES-256-GCM Envelope Encryption &bull; SHA-256 Tamper-Evident Ledger</p>
      </footer>
    </div>
  );
}
