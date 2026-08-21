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
import { Shield, Mail, Key, Eye, EyeOff, Lock, Info, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useVault();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length === 0) return score;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^a-zA-Z0-9]/.test(pass)) score += 1;
    return score; // 0 to 4
  };

  const strength = getPasswordStrength(password);
  
  const getStrengthLabel = (score: number) => {
    if (score === 0) return "";
    if (score === 1) return "Weak";
    if (score === 2) return "Fair";
    if (score === 3) return "Strong";
    if (score === 4) return "Very Strong";
    return "";
  };
  
  const getStrengthColor = (score: number) => {
    if (score === 1) return "bg-rose-500";
    if (score === 2) return "bg-amber-500";
    if (score === 3) return "bg-indigo-500";
    if (score === 4) return "bg-emerald-500";
    return "bg-slate-200";
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Master password must be at least 8 characters.");
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
    <div className="bg-slate-50 text-text-main antialiased min-h-screen flex flex-col relative overflow-x-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary-light opacity-30 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary-border opacity-30 blur-[150px]" />
      </div>

      <main className="flex-grow flex items-center justify-center p-4 md:p-10 relative z-10">
        <div className="bg-surface w-full max-w-[440px] rounded-[16px] border border-border-light shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-[28px] flex flex-col items-center">
          
          {/* Logo & Header */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center mb-4 text-primary">
              <Shield className="fill-current w-8 h-8" />
            </div>
            <h1 className="text-[32px] font-bold text-slate-800 mb-2 leading-tight tracking-tight">Create Vault</h1>
            <p className="text-[14px] text-slate-500">Set up your zero-knowledge secure environment.</p>
          </div>

          {/* Form */}
          <form className="w-full space-y-5" onSubmit={onSubmit}>
            {/* Email */}
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

            {/* Master Password */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold tracking-wider text-slate-700 block uppercase" htmlFor="password">
                Master Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  icon={<Key size={20} />}
                  className="pr-10"
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

              {/* Password Strength Meter */}
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 h-1.5 mb-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div 
                        key={level} 
                        className={`flex-1 rounded-full transition-colors duration-300 ${level <= strength ? getStrengthColor(strength) : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-slate-500">{getStrengthLabel(strength)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold tracking-wider text-slate-700 block uppercase" htmlFor="confirm_password">
                Confirm Master Password
              </label>
              <div className="relative">
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type={showConfirm ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••••••"
                  icon={<Lock size={20} />}
                  className="pr-10"
                  error={error || undefined}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  disabled={busy}
                >
                  {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" className="w-full h-[52px] text-[16px]" isLoading={busy}>
                {!busy && (
                  <>
                    <span>Create My Vault</span>
                    <ArrowRight size={20} className="ml-2" />
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Info Box */}
          <div className="mt-6 w-full bg-primary-light border border-primary-border rounded-lg p-4 flex gap-3 items-start">
            <Info className="text-primary mt-0.5 shrink-0" size={20} />
            <p className="text-[14px] text-slate-700 leading-tight">
              <strong>Keep it safe.</strong> Your Master Password is used to encrypt your vault locally. If you forget it, we cannot recover your data.
            </p>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center relative z-10">
        <p className="text-[14px] text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:text-primary-dark font-semibold transition-colors">
            Sign In
          </Link>
        </p>
      </footer>
    </div>
  );
}
