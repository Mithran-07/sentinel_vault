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

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useVault();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple password strength calculation based on length for the UI
  const getPasswordStrength = (pass: string) => {
    if (pass.length === 0) return 0;
    if (pass.length < 8) return 25;
    if (pass.length < 12) return 50;
    if (pass.length < 16) return 75;
    return 100;
  };

  const strength = getPasswordStrength(password);
  
  const getStrengthColor = (score: number) => {
    if (score === 0) return "bg-border";
    if (score <= 25) return "bg-red-500";
    if (score <= 50) return "bg-yellow-500";
    if (score <= 75) return "bg-blue-500";
    return "bg-accent";
  };

  const getStrengthText = (score: number) => {
    if (score === 0) return "";
    if (score <= 25) return "Too weak";
    if (score <= 50) return "Weak";
    if (score <= 75) return "Good";
    return "Strong";
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 12) return setError("Master password must be at least 12 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setBusy(true);
    try {
      const saltHex = generateSaltHex();
      const kdf = defaultKdfParams(saltHex);

      // Everything below happens in-browser. Only the outputs marked "-> server" leave the device.
      const masterKey = await deriveMasterKey(password, kdf);
      const authHash = await deriveAuthHash(masterKey); // -> server
      const vaultKey = generateVaultKey();
      const encryptedVaultKey = await encryptVaultKey(vaultKey, masterKey); // -> server (opaque blob)

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
        throw new Error(body.error || "Registration failed");
      }
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      setSession(vaultKey, email);
      router.push("/vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Create your vault</h1>
          <p className="mt-2 text-sm text-foreground/60">Your master password never leaves your device</p>
        </div>

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
            <div className="flex justify-between items-end">
              <label className="text-sm font-medium text-foreground/80">Master Password</label>
              <span className="text-xs text-foreground/50">{getStrengthText(strength)}</span>
            </div>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/40 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              placeholder="Min 12 characters"
            />
            {/* Password strength indicator */}
            <div className="h-1.5 w-full bg-border rounded-full overflow-hidden mt-2">
              <div 
                className={`h-full transition-all duration-300 ${getStrengthColor(strength)}`} 
                style={{ width: `${Math.max(strength, 5)}%` }}
              ></div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground/80">Confirm Password</label>
            <input
              required
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/40 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              placeholder="••••••••••••"
            />
          </div>

          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-sm text-blue-400 flex items-start gap-2">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>There is no "forgot password". If you lose your master password, your vault cannot be recovered.</span>
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
                <span>Deriving key (this takes a moment)...</span>
              </>
            ) : (
              "Create Vault"
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-foreground/60">
          Already have a vault?{" "}
          <Link href="/login" className="font-medium text-accent hover:text-accent-hover transition-colors">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
