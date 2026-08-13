"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deriveMasterKey, deriveAuthHash, decryptVaultKey } from "@/lib/crypto";
import { api, setTokens } from "@/lib/api";
import { useVault } from "@/context/VaultContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Shield, AlertCircle } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useVault();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 animate-in fade-in zoom-in-95 duration-500">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-6 shadow-soft transition-transform hover:scale-105">
            <Shield className="w-6 h-6 text-white" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign in to your vault</h1>
          <p className="mt-2 text-sm text-muted-foreground">Continue to Vault</p>
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
            <label className="text-sm font-medium text-foreground flex justify-between">
              Master Password
            </label>
            <Input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="bg-background font-mono"
            />
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
            Sign In
          </Button>
          
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-surface px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          
          <Link href="/enterprise/login" className="w-full flex">
            <Button type="button" variant="outline" className="w-full">
              Single Sign-On (SSO)
            </Button>
          </Link>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href="/register" className="font-medium text-accent hover:text-accent-hover transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

