"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function MfaSettings() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);

  // Setup state
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Disable state
  const [disableCode, setDisableCode] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  useEffect(() => {
    void loadMfaStatus();
  }, []);

  async function loadMfaStatus() {
    setLoading(true);
    try {
      const res = await api.get("/auth/mfa/status");
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.mfaEnabled);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleStartSetup() {
    setSetupError(null);
    setSetupBusy(true);
    try {
      const res = await api.post("/auth/mfa/totp/setup");
      if (!res.ok) throw new Error("Failed to initiate MFA setup");
      const data = await res.json();
      setQrCodeUrl(data.qrCodeDataUrl);
      setManualKey(data.secret);
      setSetupModalOpen(true);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleVerifySetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupError(null);
    setSetupBusy(true);
    try {
      const res = await api.post("/auth/mfa/totp/verify", { code: verifyCode });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Invalid verification code");
      }
      setSetupModalOpen(false);
      setVerifyCode("");
      await loadMfaStatus();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleDisableMfa(e: React.FormEvent) {
    e.preventDefault();
    setDisableError(null);
    setDisableBusy(true);
    try {
      const res = await api.post("/auth/mfa/totp/disable", { code: disableCode });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to disable MFA");
      }
      setDisableModalOpen(false);
      setDisableCode("");
      await loadMfaStatus();
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : "Disable failed");
    } finally {
      setDisableBusy(false);
    }
  }

  return (
    <div className="space-y-6 border-b border-border/50 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">Two-Factor Authentication (TOTP)</h2>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                enabled
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}
            >
              {loading ? "Checking..." : enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="text-xs text-foreground/50 mt-1">
            Require a 6-digit security code from Google Authenticator, Authy, or 1Password when logging into your vault.
          </p>
        </div>

        {!loading && (
          <div>
            {enabled ? (
              <button
                onClick={() => setDisableModalOpen(true)}
                className="px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Disable MFA
              </button>
            ) : (
              <button
                disabled={setupBusy}
                onClick={handleStartSetup}
                className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {setupBusy ? "Generating QR..." : "Enable MFA"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Setup Modal */}
      {setupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <h3 className="text-lg font-bold text-foreground">Set up Two-Factor Authentication</h3>
              <button onClick={() => setSetupModalOpen(false)} className="text-foreground/40 hover:text-foreground">✕</button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-foreground/60">
                1. Scan this QR code using your authenticator app (Google Authenticator, Authy, etc.):
              </p>

              {qrCodeUrl && (
                <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-inner">
                  <img src={qrCodeUrl} alt="TOTP QR Code" className="w-44 h-44" />
                </div>
              )}

              {manualKey && (
                <div className="bg-background border border-border rounded-lg p-3 text-center">
                  <p className="text-[10px] text-foreground/40 uppercase tracking-wider font-bold mb-1">Manual Setup Key</p>
                  <code className="text-xs text-accent font-mono select-all font-semibold">{manualKey}</code>
                </div>
              )}

              <form onSubmit={handleVerifySetup} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground/80">2. Enter 6-digit code to verify:</label>
                  <input
                    required
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    placeholder="123456"
                    className="w-full text-center text-lg tracking-widest font-mono rounded-lg border border-border bg-background py-2 text-foreground outline-none focus:border-accent"
                  />
                </div>

                {setupError && (
                  <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">{setupError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSetupModalOpen(false)}
                    className="flex-1 py-2 rounded-lg border border-border text-xs text-foreground/70 hover:bg-surfaceHover"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={setupBusy || verifyCode.length !== 6}
                    className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                  >
                    {setupBusy ? "Verifying..." : "Verify & Enable"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Disable Modal */}
      {disableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <h3 className="text-lg font-bold text-foreground">Disable Two-Factor Authentication</h3>
              <button onClick={() => setDisableModalOpen(false)} className="text-foreground/40 hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleDisableMfa} className="space-y-4">
              <p className="text-xs text-foreground/60">
                To confirm MFA disablement, enter a current 6-digit code from your authenticator app. For security, all other active sessions will be disconnected.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground/80">Current 6-digit Code:</label>
                <input
                  required
                  maxLength={6}
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456"
                  className="w-full text-center text-lg tracking-widest font-mono rounded-lg border border-border bg-background py-2 text-foreground outline-none focus:border-accent"
                />
              </div>

              {disableError && (
                <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">{disableError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDisableModalOpen(false)}
                  className="flex-1 py-2 rounded-lg border border-border text-xs text-foreground/70 hover:bg-surfaceHover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disableBusy || disableCode.length !== 6}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  {disableBusy ? "Disabling..." : "Disable MFA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
