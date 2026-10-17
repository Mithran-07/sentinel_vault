"use client";

import { useState } from "react";
import { ItemPayload, TYPE_LABELS, ItemType } from "./ItemModal";
import { api } from "@/lib/api";
import { generateShareKey, exportShareSecret, encryptItem } from "@/lib/crypto";
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Key, 
  CreditCard, 
  FileText, 
  Lock, 
  Timer, 
  Ban, 
  ShieldCheck, 
  ExternalLink 
} from "lucide-react";
import { Button } from "./ui/Button";

interface ShareModalProps {
  vaultItemId: string;
  data: ItemPayload;
  onClose: () => void;
}

export function ShareModal({ vaultItemId, data, onClose }: ShareModalProps) {
  const [expiresInMinutes, setExpiresInMinutes] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [shareId, setShareId] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const shareKey = generateShareKey();
      const blob = await encryptItem(data, shareKey);

      const res = await api.post("/share", {
        vaultItemId,
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        expiresInMinutes,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const resData = await res.json();
      setShareId(resData.id);
      setExpiresAt(new Date(resData.expiresAt));
      const url = `${window.location.origin}/share/${resData.id}#${exportShareSecret(shareKey)}`;
      setShareLink(url);
    } catch (err: any) {
      console.error(err);
      setError("Failed to create share link: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    if (!shareId) return;
    setRevoking(true);
    setError("");
    try {
      const res = await api.del(`/share/${shareId}`);
      if (!res.ok) throw new Error("Failed to revoke");
      setRevoked(true);
      setShareLink("");
    } catch (err: any) {
      console.error(err);
      setError("Failed to revoke link: " + (err.message || "Unknown error"));
    } finally {
      setRevoking(false);
    }
  }

  function handleCopy() {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "LOGIN": return <Key size={18} className="text-accent" />;
      case "CARD": return <CreditCard size={18} className="text-uv" />;
      case "SECURE_NOTE": return <FileText size={18} className="text-lime" />;
      default: return <Lock size={18} className="text-fg-subtle" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-md p-4 animate-fade-in"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-surface border border-line rounded-2xl shadow-pop w-full max-w-[500px] overflow-hidden z-10 flex flex-col animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-line flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface border border-accent/30 text-accent flex items-center justify-center">
              <Lock size={16} />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-fg tracking-tight">
                Secure Link Share
              </h2>
              <p className="text-[11px] font-mono text-accent">
                Zero-knowledge key fragment delivery
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-2 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 flex flex-col gap-5">
          {/* Item Preview */}
          <div className="flex items-center gap-3.5 p-3 rounded-xl border border-line bg-surface-2/50">
            <div className="w-9 h-9 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0">
              {getIcon(data.type)}
            </div>
            <div className="truncate min-w-0">
              <p className="text-xs font-semibold text-fg truncate">{data.name || "Unnamed Credential"}</p>
              <p className="text-[11px] text-fg-subtle font-mono truncate">
                {"username" in data && data.username ? data.username : TYPE_LABELS[data.type as ItemType]}
              </p>
            </div>
          </div>

          {!shareLink && !revoked && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="label mb-2">Self-Destruct Link Expiry</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setExpiresInMinutes(5)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                      expiresInMinutes === 5
                        ? "border-accent bg-accent/15 text-accent font-semibold shadow-sm"
                        : "border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg"
                    }`}
                  >
                    <Timer size={14} />
                    <span>5 minutes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpiresInMinutes(10)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                      expiresInMinutes === 10
                        ? "border-accent bg-accent/15 text-accent font-semibold shadow-sm"
                        : "border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg"
                    }`}
                  >
                    <Timer size={14} />
                    <span>10 minutes</span>
                  </button>
                </div>
              </div>

              {/* Security info box */}
              <div className="p-3 rounded-xl bg-accent/10 border border-accent/25 text-xs text-fg leading-relaxed">
                <div className="flex items-center gap-1.5 font-semibold text-accent mb-1 font-mono text-[11px]">
                  <ShieldCheck size={14} />
                  <span>Client-Side Link Cryptography</span>
                </div>
                The decryption key is embedded solely in the URL hash fragment (`#key`). The server stores only ciphertext and never learns the secret key.
              </div>

              {error && (
                <div className="p-3 bg-danger/10 text-danger text-xs rounded-xl border border-danger/30 flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* Success Generated State */}
          {shareLink && !revoked && (
            <div className="flex flex-col gap-3.5 animate-fade-in">
              <div className="flex items-center gap-2 text-lime bg-lime/10 px-3.5 py-2.5 rounded-xl border border-lime/30 text-xs font-medium">
                <CheckCircle2 size={16} className="shrink-0 text-lime" />
                <span>One-time share link ready. Recipient decrypts client-side.</span>
              </div>

              {/* Link Box */}
              <div className="flex items-center justify-between border border-line bg-surface-2/80 rounded-xl p-2 pl-3">
                <code className="font-mono text-xs text-accent truncate mr-2">
                  {shareLink}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
              </div>

              <div className="flex items-center justify-between text-xs text-fg-subtle pt-1">
                <div className="flex items-center gap-1.5 text-warning font-mono text-[11px]">
                  <Timer size={14} />
                  <span>
                    Expires in ~{expiresAt ? Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : expiresInMinutes} min
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
                  Time-Limited
                </span>
              </div>
            </div>
          )}

          {/* Revoked State */}
          {revoked && (
            <div className="text-center py-6 animate-pop-in">
              <div className="w-12 h-12 rounded-xl bg-danger/15 text-danger border border-danger/35 flex items-center justify-center mx-auto mb-3">
                <Ban size={22} />
              </div>
              <h3 className="font-display text-sm font-bold text-fg mb-1">Link Revoked</h3>
              <p className="text-xs text-fg-subtle max-w-xs mx-auto">
                The link has been deleted from the server and cannot be viewed by anyone.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-line bg-surface-2/30 flex items-center justify-between">
          {!shareLink && !revoked ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} isLoading={loading} variant="primary">
                Generate Secure Link
              </Button>
            </>
          ) : (
            <>
              {!revoked ? (
                <Button
                  variant="dangerGhost"
                  size="sm"
                  onClick={handleRevoke}
                  disabled={revoking}
                >
                  <Ban size={14} className="mr-1.5" />
                  {revoking ? "Revoking..." : "Revoke Access"}
                </Button>
              ) : (
                <div />
              )}
              <Button onClick={onClose} variant="primary" size="sm">
                Done
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
