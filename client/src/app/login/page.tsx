"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deriveMasterKey, deriveAuthHash, decryptVaultKey } from "@/lib/crypto";
import { api, setTokens } from "@/lib/api";
import { useVault } from "@/context/VaultContext";
import { Shield, Mail, Lock, Eye, EyeOff, ArrowRight, Fingerprint, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useVault();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="bg-slate-50 text-text-main antialiased min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-light opacity-30 blur-[120px]" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-light rounded-full blur-[120px] opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
      </div>

      {/* Main Content Area */}
      <main className="flex-grow flex items-center justify-center p-4 md:p-10 relative z-10">
        {/* Login Card */}
        <div className="bg-surface w-full max-w-[440px] rounded-[16px] border border-border-light shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-[28px] flex flex-col items-center">
          
          {/* Logo & Header */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center mb-4 text-primary">
              <Shield className="fill-current w-8 h-8" />
            </div>
            <h1 className="text-[32px] font-bold text-slate-800 mb-2 leading-tight tracking-tight">Welcome back</h1>
            <p className="text-[14px] text-slate-500">Log in to Sentinel Vault to access your secure data.</p>
          </div>

          {/* Login Form */}
          <form className="w-full space-y-5" onSubmit={onSubmit}>
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold tracking-wider text-slate-700 block uppercase" htmlFor="email">
                Email Address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                icon={<Mail size={20} />}
                disabled={busy}
              />
            </div>

            {/* Master Password Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[12px] font-semibold tracking-wider text-slate-700 block uppercase" htmlFor="password">
                  Master Password
                </label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  icon={<Lock size={20} />}
                  className="pr-10"
                  error={error || undefined}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  disabled={busy}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 space-y-4">
              <Button type="submit" variant="primary" className="w-full h-[52px] text-[16px]" isLoading={busy}>
                {!busy && (
                  <>
                    <span>Unlock Vault</span>
                    <ArrowRight size={20} className="ml-2" />
                  </>
                )}
              </Button>
              
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-border-light" />
                <span className="flex-shrink-0 mx-4 text-[14px] text-slate-400">or</span>
                <div className="flex-grow border-t border-border-light" />
              </div>
              
              <Link href="/login/passkey" className="w-full bg-surface hover:bg-slate-50 border-[1.5px] border-border-light text-slate-700 font-medium py-[10px] px-4 rounded-[10px] transition-all flex justify-center items-center gap-2 text-[16px]">
                <Fingerprint size={20} className="text-primary" />
                <span>Sign in with a passkey</span>
              </Link>
            </div>
          </form>

          {/* Info Box */}
          <div className="mt-6 w-full bg-primary-light border border-primary-border rounded-lg p-4 flex gap-3 items-start">
            <Info className="text-primary mt-0.5 shrink-0" size={20} />
            <p className="text-[14px] text-slate-700 leading-tight">
              <strong>Local Encryption Active.</strong> Your Master Password never leaves your device. We cannot recover it if lost.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center relative z-10">
        <p className="text-[14px] text-slate-500">
          Don't have an account?{" "}
          <Link href="/register" className="text-primary hover:text-primary-dark font-semibold transition-colors">
            Create Vault
          </Link>
        </p>
      </footer>
    </div>
  );
}
