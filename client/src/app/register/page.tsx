"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  generateSaltHex,
  defaultKdfParams,
  deriveMasterKey,
  deriveAuthHash,
  generateVaultKey,
  encryptVaultKey,
} from "@/lib/crypto";
import { api, setTokens } from "@/lib/api";
import { useVault } from "@/context/VaultContext";
import { Shield, Mail, KeyRound, Eye, EyeOff, Lock, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useVault();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length === 0) return score;
    if (pass.length >= 8) score += 1;
    if (pass.length >= 14) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass) && /[0-9]/.test(pass)) score += 1;
    if (/[^a-zA-Z0-9]/.test(pass)) score += 1;
    return score; // 0 to 4
  };

  const strength = getPasswordStrength(password);
  
  const getStrengthMeta = (score: number) => {
    switch (score) {
      case 1:
        return { label: "Weak — min 8 chars", color: "bg-danger", text: "text-danger" };
      case 2:
        return { label: "Fair — add numbers & mixed case", color: "bg-warning", text: "text-warning" };
      case 3:
        return { label: "Good — add special symbols", color: "bg-accent", text: "text-accent" };
      case 4:
        return { label: "Strong — high entropy", color: "bg-emerald-500", text: "text-emerald-400" };
      default:
        return { label: "", color: "bg-surface-3", text: "text-fg-subtle" };
    }
  };

  const strengthMeta = getStrengthMeta(strength);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Master password must be at least 8 characters long.");
      return;
    }
    if (password !== confirm) {
      setError("Master passwords do not match. Please re-enter.");
      return;
    }

    setBusy(true);
    setStatusMessage("Generating cryptographic CSPRNG salt & KDF params...");

    try {
      const saltHex = generateSaltHex();
      const kdf = defaultKdfParams(saltHex);

      setStatusMessage("Deriving Master Encryption Key (Argon2id)...");
      const masterKey = await deriveMasterKey(password, kdf);
      const authHash = await deriveAuthHash(masterKey);

      setStatusMessage("Generating 256-bit Vault Encryption Key...");
      const vaultKey = generateVaultKey();
      const encryptedVaultKey = await encryptVaultKey(vaultKey, masterKey);

      setStatusMessage("Registering zero-knowledge account on server...");
      const res = await api.post("/auth/register", {
        email,
        authHash,
        kdfSalt: kdf.saltHex,
        kdfMemoryKb: kdf.memoryKb,
        kdfIterations: kdf.iterations,
        kdfParallelism: kdf.parallelism,
        encryptedVaultKeyCiphertext: encryptedVaultKey.ciphertext,
        encryptedVaultKeyIv: encryptedVaultKey.iv,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Account registration failed.");
      }

      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      setSession(vaultKey, email);

      router.push("/vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
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
          <span>Already registered?</span>
          <Link href="/login">
            <Button variant="secondary" size="xs">
              Sign In
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Registration Card */}
      <main className="flex-1 flex items-center justify-center p-4 relative z-10 my-auto">
        <div className="w-full max-w-[420px] bg-surface rounded-xl border border-line shadow-popover p-7 flex flex-col">
          
          {/* Card Header */}
          <div className="text-center mb-6">
            <div className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center mx-auto mb-3 text-accent shadow-xs">
              <ShieldCheck size={18} />
            </div>
            <h1 className="text-xl font-bold font-display text-fg tracking-tight">Create Zero-Knowledge Vault</h1>
            <p className="text-2xs text-fg-muted mt-1 font-mono">Client-side Argon2id key generation</p>
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
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong passphrase"
                  icon={<KeyRound size={16} />}
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

              {/* Password Strength Meter */}
              {password.length > 0 && (
                <div className="pt-2 space-y-1">
                  <div className="flex gap-1.5 h-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`flex-1 rounded-full transition-all duration-300 ${
                          level <= strength ? strengthMeta.color : "bg-surface-3"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className={strengthMeta.text}>{strengthMeta.label}</span>
                    <span className="text-fg-subtle">{password.length} chars</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="relative">
                <Input
                  label="Confirm Master Password"
                  id="confirm_password"
                  name="confirm_password"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your passphrase"
                  icon={<Lock size={16} />}
                  className="pr-10 font-mono text-xs"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2.5 top-[28px] text-fg-subtle hover:text-fg transition-colors focus:outline-none"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  disabled={busy}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirm.length > 0 && (
                <div className="text-[10px] font-mono flex items-center gap-1 mt-1.5">
                  {password === confirm ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Passwords match
                    </span>
                  ) : (
                    <span className="text-danger">Passwords do not match</span>
                  )}
                </div>
              )}
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
                    <span>Initialize Vault</span>
                    <ArrowRight size={14} className="ml-1.5" />
                  </>
                )}
              </Button>

              {statusMessage && (
                <p className="text-center text-2xs font-mono text-accent animate-pulse">
                  {statusMessage}
                </p>
              )}
            </div>
          </form>

          {/* Cryptographic Zero-Knowledge Notice */}
          <div className="mt-5 pt-3.5 border-t border-line flex items-start gap-2 text-[10px] text-fg-subtle leading-relaxed font-mono">
            <Lock size={12} className="text-accent shrink-0 mt-0.5" />
            <p>
              <strong className="text-fg-muted">Irreversible Privacy:</strong> We store zero plaintext credentials. Your master password cannot be reset or retrieved by server operators.
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
