"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Building2, AlertCircle } from "lucide-react";

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
        throw new Error(body.error || "SSO login unavailable for this email");
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 animate-in fade-in zoom-in-95 duration-500">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-6 shadow-soft transition-transform hover:scale-105">
            <Building2 className="w-6 h-6 text-white" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Enterprise Sign-In</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with your organizational identity</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Work Email</label>
            <Input
              required
              type="email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="name@company.com"
              className="bg-background"
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
            Continue with SSO
          </Button>
          
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-surface px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          
          <Button variant="ghost" className="w-full mt-4" onClick={() => router.push("/login")}>
            Back to Standard Login
          </Button>
        </form>
      </div>
    </main>
  );
}
