"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Building2, AlertCircle, Shield, ArrowRight, ArrowLeft } from "lucide-react";

export default function EnterpriseLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.get(`/auth/sso/login?identifier=${encodeURIComponent(identifier)}`);
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "SSO login unavailable for this email domain");
      }
      
      const data = await res.json();
      
      if (data.loginUrl) {
        window.location.href = data.loginUrl;
      } else {
        throw new Error("Invalid SSO configuration returned from server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "SSO Discovery failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12 relative overflow-hidden">
      {/* Background cyber grid */}
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-surface-2 border border-accent/40 text-accent mb-4 shadow-[0_0_20px_-3px_rgb(var(--c-accent)/0.35)]"
          >
            <Building2 className="w-6 h-6" />
          </Link>
          <div className="eyebrow mb-1">ENTERPRISE FEDERATION</div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            Corporate Single Sign-On
          </h1>
          <p className="mt-1.5 text-xs text-fg-muted">
            Authenticate via your organization&apos;s identity provider (Okta, Entra ID, Google)
          </p>
        </div>

        <form onSubmit={onSubmit} className="panel p-6 sm:p-7 space-y-4 shadow-pop bg-surface">
          <div>
            <label className="label">Work Email Address *</label>
            <input
              required
              type="email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="employee@company.com"
              className="field"
              disabled={busy}
            />
          </div>

          {error && (
            <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-xs text-danger flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full h-11" isLoading={busy}>
            <span>Continue with SSO</span>
            {!busy && <ArrowRight size={16} className="ml-1.5" />}
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono">
              <span className="bg-surface px-2 text-fg-subtle">Or</span>
            </div>
          </div>

          <Link href="/login" className="block">
            <Button variant="ghost" className="w-full">
              <ArrowLeft size={14} className="mr-1.5" />
              <span>Back to Master Password Login</span>
            </Button>
          </Link>
        </form>
      </div>
    </main>
  );
}
