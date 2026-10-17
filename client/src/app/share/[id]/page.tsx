"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { importShareSecret, decryptItem, EncryptedBlob } from "@/lib/crypto";
import { ItemPayload, TYPE_LABELS, ItemType } from "@/components/ItemModal";
import { Shield, ShieldCheck, AlertTriangle, Lock, Key, Copy, Check, FileText, CreditCard, Lock as LockIcon, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export default function ShareRecipientPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ItemPayload | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [decryptedAt] = useState(new Date());
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    async function loadShare() {
      try {
        const secretBase64Url = window.location.hash.slice(1); // remove '#'
        if (!secretBase64Url) {
          setError("Missing decryption secret in URL fragment. Check that you copied the full link.");
          return;
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"}/share/${params.id}`);
        if (!res.ok) {
          if (res.status === 410) {
            const body = await res.json().catch(() => ({}));
            setError(body.error || "This secure link has expired or reached its access threshold.");
          } else if (res.status === 404) {
            setError("Secure link not found or has already been revoked by the sender.");
          } else {
            setError("Failed to fetch encrypted payload from the server.");
          }
          return;
        }

        const body = await res.json();
        const shareKey = importShareSecret(secretBase64Url);
        const blob: EncryptedBlob = { ciphertext: body.ciphertext, iv: body.iv };

        const payload = await decryptItem<ItemPayload>(blob, shareKey);
        
        setData(payload);
        if (body.expiresAt) {
          setExpiresAt(new Date(body.expiresAt));
        }
      } catch (err) {
        console.error("Decryption failed:", err);
        setError("Unable to decrypt this secure credential. The link key may be corrupted or invalid.");
      } finally {
        setLoading(false);
      }
    }
    loadShare();
  }, [params.id]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "LOGIN": return <Key size={22} className="text-accent-primary" />;
      case "CARD": return <CreditCard size={22} className="text-accent-secondary" />;
      case "SECURE_NOTE": return <FileText size={22} className="text-accent-primary" />;
      default: return <LockIcon size={22} className="text-accent-primary" />;
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-text-primary p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(22,217,227,0.1),rgba(255,255,255,0))] pointer-events-none" />
        
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500 max-w-md w-full bg-surface p-8 rounded-2xl shadow-2xl border border-border relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center relative overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-accent-primary/20 animate-ping" />
            <Shield className="w-8 h-8 text-accent-primary relative z-10" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold font-display text-text-primary">Decrypting In Browser</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              Fetching encrypted ciphertext and deriving key from URL hash. The server never sees the decrypted secret.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-accent-primary bg-accent-primary/5 px-3 py-1.5 rounded-full border border-accent-primary/20">
            <Lock size={12} />
            <span>AES-256-GCM client-side</span>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-text-primary p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(244,63,94,0.12),rgba(255,255,255,0))] pointer-events-none" />
        
        <div className="flex flex-col items-center text-center max-w-[460px] w-full bg-surface border border-rose-500/30 rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mb-6 border border-rose-500/30">
            <AlertTriangle size={32} />
          </div>
          <h1 className="text-2xl font-bold font-display text-text-primary mb-3">Access Denied</h1>
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">{error}</p>
          
          <div className="p-4 bg-surface-elevated border border-border rounded-xl text-xs text-text-secondary w-full flex gap-3 text-left mb-6">
            <Lock className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Ephemeral zero-knowledge links enforce strict single-use or time expiration. The decryption key exists solely in the URL hash fragment and was never logged on any server.
            </p>
          </div>

          <Link href="/">
            <Button variant="secondary" size="md">
              Return to Sentinel Vault
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="min-h-screen bg-background text-text-primary py-12 px-4 flex justify-center relative overflow-hidden">
      {/* Background radial atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(22,217,227,0.12),rgba(155,140,255,0.05),transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-cyber-grid bg-[size:40px_40px] opacity-[0.03] pointer-events-none" />

      <div className="max-w-[620px] w-full animate-in fade-in slide-in-from-bottom-4 relative z-10 my-auto">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-surface/90 backdrop-blur-md p-6 rounded-2xl border border-border shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold font-display text-text-primary tracking-tight">Sentinel Vault</h1>
                <Badge variant="success" size="sm">Decrypted</Badge>
              </div>
              <p className="text-xs text-accent-positive flex items-center gap-1.5 mt-0.5 font-mono">
                <Lock size={12} /> End-to-end zero-knowledge
              </p>
            </div>
          </div>
          
          {expiresAt && (
            <div className="px-3.5 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs font-mono text-text-secondary flex items-center gap-2 self-start sm:self-auto shrink-0">
              <Clock size={13} className="text-amber-400" />
              <span>Expires {expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}
        </div>

        {/* Content Card */}
        <div className="bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden backdrop-blur-md">
          {/* Header Banner */}
          <div className="px-6 py-5 border-b border-border bg-surface-elevated/60 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center shadow-inner shrink-0">
              {getIcon(data.type)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold font-display text-text-primary truncate">{data.name || "Unnamed Credential"}</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {TYPE_LABELS[data.type as ItemType] || "Secure Item"}
              </p>
            </div>
          </div>

          {/* Credential Data Fields */}
          <div className="p-6 space-y-5">
            {"username" in data && data.username && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-medium text-text-secondary uppercase tracking-wider block">Username / Account</label>
                <div className="flex items-center justify-between bg-surface-elevated border border-border rounded-xl px-4 py-3 relative group">
                  <span className="text-sm font-mono text-text-primary break-all select-all">{data.username}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(data.username!, "username")}
                    className="h-8 px-2.5 text-text-secondary hover:text-text-primary shrink-0 ml-2"
                  >
                    {copiedField === "username" ? (
                      <span className="flex items-center text-accent-positive gap-1 text-xs">
                        <Check size={14} /> Copied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs">
                        <Copy size={14} /> Copy
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {"password" in data && data.password && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-medium text-text-secondary uppercase tracking-wider block">Password</label>
                <div className="flex items-center justify-between bg-surface-elevated border border-border rounded-xl px-4 py-3 relative group">
                  <span className="text-sm font-mono text-accent-primary break-all select-all pr-2">{data.password}</span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleCopy(data.password!, "password")}
                    className="h-8 px-3 shrink-0 ml-2"
                  >
                    {copiedField === "password" ? (
                      <span className="flex items-center gap-1 text-xs font-medium">
                        <Check size={14} /> Copied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium">
                        <Copy size={14} /> Copy Password
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {"url" in data && data.url && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-medium text-text-secondary uppercase tracking-wider block">Target Service URL</label>
                <div className="flex items-center justify-between bg-surface-elevated border border-border rounded-xl px-4 py-3">
                  <a
                    href={data.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono text-accent-primary hover:underline truncate block"
                  >
                    {data.url}
                  </a>
                  <a
                    href={data.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-secondary hover:text-accent-primary ml-2 p-1"
                    title="Open in new tab"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            )}

            {"content" in data && data.content && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-medium text-text-secondary uppercase tracking-wider block">Secure Note</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(data.content!, "content")}
                    className="h-6 px-2 text-text-secondary hover:text-text-primary text-xs"
                  >
                    {copiedField === "content" ? "Copied" : "Copy Note"}
                  </Button>
                </div>
                <div className="bg-surface-elevated border border-border rounded-xl p-4 text-xs font-mono text-text-primary whitespace-pre-wrap leading-relaxed max-h-[260px] overflow-y-auto selection:bg-accent-primary/20">
                  {data.content}
                </div>
              </div>
            )}

            {"notes" in data && data.notes && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-medium text-text-secondary uppercase tracking-wider block">Additional Metadata</label>
                <div className="bg-surface-elevated border border-border rounded-xl p-4 text-xs text-text-secondary whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto">
                  {data.notes}
                </div>
              </div>
            )}
          </div>

          {/* Security Safeguard Footer */}
          <div className="px-6 py-4 bg-surface-elevated/40 border-t border-border flex items-center justify-between text-xs text-text-secondary">
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <Lock size={12} className="text-accent-primary" /> Memory-only retention
            </span>
            <span className="font-mono text-[11px] text-text-muted">
              Decrypted at {decryptedAt.toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Disclaimer / Promotion */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
            This credential was decrypted client-side using WebCrypto AES-256-GCM. Closing this window purges the decrypted key from memory.
          </p>
          <div>
            <Link href="/" className="text-xs font-medium text-accent-primary hover:underline">
              Learn about Sentinel Vault Zero-Knowledge Architecture &rarr;
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
