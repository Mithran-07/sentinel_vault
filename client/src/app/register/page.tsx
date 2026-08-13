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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Shield, AlertCircle, Info } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useVault();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (score <= 25) return "bg-destructive";
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

      const masterKey = await deriveMasterKey(password, kdf);
      const authHash = await deriveAuthHash(masterKey);
      const vaultKey = generateVaultKey();
      const encryptedVaultKey = await encryptVaultKey(vaultKey, masterKey);

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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 animate-in fade-in zoom-in-95 duration-500">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-6 shadow-soft transition-transform hover:scale-105">
            <Shield className="w-6 h-6 text-white" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Create your vault</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your keys never leave your device</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="bg-background"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <label className="text-sm font-medium text-foreground">Master Password</label>
              <span className={`text-xs font-medium ${strength > 50 ? 'text-accent' : 'text-muted-foreground'}`}>{getStrengthText(strength)}</span>
            </div>
            <Input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 12 characters"
              className="bg-background font-mono"
            />
            {/* Password strength indicator */}
            <div className="h-1 w-full bg-border rounded-full overflow-hidden mt-2">
              <div 
                className={`h-full transition-all duration-300 ${getStrengthColor(strength)}`} 
                style={{ width: `${Math.max(strength, 5)}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Confirm Password</label>
            <Input
              required
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••••"
              className="bg-background font-mono"
            />
          </div>

          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-sm text-blue-500 flex items-start gap-2">
            <Info className="w-5 h-5 shrink-0" />
            <span className="leading-snug">There is no "forgot password". If you lose your master password, your vault cannot be recovered.</span>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-start gap-2 animate-in slide-in-from-top-1">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            isLoading={busy}
            className="w-full bg-accent hover:bg-accent-hover text-white shadow-soft"
          >
            Create Vault
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have a vault?{" "}
          <Link href="/login" className="font-medium text-accent hover:text-accent-hover transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

