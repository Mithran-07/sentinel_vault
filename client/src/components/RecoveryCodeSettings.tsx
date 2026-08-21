"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function RecoveryCodeSettings() {
  const [enabled, setEnabled] = useState(false);
  const [remainingCodes, setRemainingCodes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await api.get("/auth/recovery/status");
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.enabled);
        setRemainingCodes(data.remainingCodes);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateCodes() {
    if (enabled && !window.confirm("Generating new recovery codes will invalidate all previously generated codes. Are you sure?")) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/auth/recovery/generate");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to generate recovery codes");
      }

      const data = await res.json();
      setGeneratedCodes(data.codes);
      setConfirmedSaved(false);
      setCopied(false);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  function handleCopyAll() {
    if (!generatedCodes) return;
    const text = generatedCodes.join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadTxt() {
    if (!generatedCodes) return;
    const text = `Zero-Knowledge Password Vault Emergency Recovery Codes\nGenerated: ${new Date().toISOString()}\n\n` + generatedCodes.join("\n") + "\n\nStore these codes offline in a secure location. Each code can be used ONCE.";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vault-recovery-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCloseModal() {
    if (!confirmedSaved) return;
    setGeneratedCodes(null);
    setConfirmedSaved(false);
  }

  return (
    <div className="space-y-6 border-b border-border/50 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-foreground">Account Recovery Codes</h2>
            <Badge
              className={
                enabled
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 uppercase tracking-wide px-2 py-0"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/10 uppercase tracking-wide px-2 py-0"
              }
            >
              {enabled ? `Active (${remainingCodes} remaining)` : "Not Configured"}
            </Badge>
          </div>
          <p className="text-xs text-foreground/50 mt-1">
            Single-use 128-bit emergency recovery codes to bypass a lost TOTP authenticator or Passkey.
          </p>
        </div>

        <Button
          disabled={busy}
          onClick={handleGenerateCodes}
          className="flex-shrink-0"
        >
          {busy ? "Generating..." : enabled ? "Regenerate Codes" : "Generate Recovery Codes"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-20 text-foreground/50">
          <svg className="animate-spin h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        </div>
      ) : !enabled ? (
        <div className="p-6 rounded-xl border border-dashed border-border text-center bg-surface/30 space-y-2">
          <p className="text-sm font-medium text-foreground/70">No recovery codes generated yet</p>
          <p className="text-xs text-foreground/40 max-w-sm mx-auto">
            Generate 10 emergency codes to ensure you can access your account if you lose your phone or hardware key.
          </p>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-background border border-border flex items-center justify-center text-base">
              🛡️
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Recovery Protection Active</p>
              <p className="text-xs text-foreground/50">
                You have {remainingCodes} single-use recovery code(s) remaining in this batch.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Generated Codes Modal */}
      {generatedCodes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="border-b border-border/50 pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span>⚠️ Save Your Recovery Codes</span>
              </h3>
              <p className="text-xs text-amber-400 mt-1">
                These recovery codes will be shown ONLY ONCE. Store them in a safe offline location.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-background p-4 rounded-xl border border-border font-mono text-xs font-semibold text-foreground text-center">
              {generatedCodes.map((code, idx) => (
                <div key={idx} className="p-1.5 rounded bg-surface border border-border/50 select-all">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCopyAll}
                className="flex-1"
              >
                {copied ? "✓ Copied!" : "📋 Copy All"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleDownloadTxt}
                className="flex-1"
              >
                ⬇️ Download .txt
              </Button>
            </div>

            <div className="pt-2 border-t border-border/50 space-y-3">
              <label className="flex items-start gap-2.5 text-xs text-foreground/80 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmedSaved}
                  onChange={(e) => setConfirmedSaved(e.target.checked)}
                  className="mt-0.5 rounded border-border text-accent focus:ring-accent"
                />
                <span>I have saved these recovery codes in a safe place. I understand they will not be shown again.</span>
              </label>

              <Button
                type="button"
                disabled={!confirmedSaved}
                onClick={handleCloseModal}
                className="w-full"
              >
                I'm Done — Close Window
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
