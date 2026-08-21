"use client";

import { useState } from "react";
import { ItemPayload, TYPE_LABELS, ItemType } from "./ItemModal";
import { api } from "@/lib/api";
import { generateShareKey, exportShareSecret, encryptItem } from "@/lib/crypto";
import { X, CheckCircle, Info, Copy, Check, Key, CreditCard, FileText, Lock, Timer, Ban } from "lucide-react";
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
      setError("Failed to create share link: " + err.message);
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
      setError("Failed to revoke link: " + err.message);
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
      case "LOGIN": return <Key size={20} className="text-slate-500" />;
      case "CARD": return <CreditCard size={20} className="text-slate-500" />;
      case "SECURE_NOTE": return <FileText size={20} className="text-slate-500" />;
      default: return <Lock size={20} className="text-slate-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-800/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-surface w-full max-w-[500px] rounded-[20px] shadow-2xl flex flex-col overflow-hidden border border-border-light"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-[28px] py-6 border-b border-border-light flex items-center justify-between bg-white">
          <h2 className="text-[18px] font-semibold text-slate-900">Share Credential</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-[28px] flex flex-col gap-6 bg-white">
          {/* Credential Preview */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-border-light bg-slate-50">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
              {getIcon(data.type)}
            </div>
            <div className="truncate">
              <p className="text-[16px] font-medium text-slate-900 truncate">{data.name || "Unnamed Credential"}</p>
              <p className="text-[14px] text-slate-500 truncate">
                {"username" in data ? data.username : TYPE_LABELS[data.type as ItemType]}
              </p>
            </div>
          </div>

          {!shareLink && !revoked && (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-[14px] font-semibold text-slate-700 mb-3">Link Expiration</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setExpiresInMinutes(5)}
                    className={`py-2.5 px-4 rounded-lg border text-[14px] font-medium transition-all ${
                      expiresInMinutes === 5 
                        ? 'border-primary bg-primary-light/50 text-primary-dark shadow-sm' 
                        : 'border-border-light bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    5 minutes
                  </button>
                  <button
                    onClick={() => setExpiresInMinutes(10)}
                    className={`py-2.5 px-4 rounded-lg border text-[14px] font-medium transition-all ${
                      expiresInMinutes === 10 
                        ? 'border-primary bg-primary-light/50 text-primary-dark shadow-sm' 
                        : 'border-border-light bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    10 minutes
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-danger-bg text-danger text-[14px] rounded-lg border border-danger-border flex items-start gap-2">
                  <Info size={18} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Success State */}
          {shareLink && !revoked && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-3 text-success bg-success-bg px-4 py-3 rounded-lg border border-success-border">
                <CheckCircle size={20} className="shrink-0 text-success" />
                <p className="text-[14px] font-medium text-success-text">Link generated securely</p>
              </div>

              {/* Link Box */}
              <div className="flex items-center justify-between border border-primary-light bg-primary-light/30 rounded-lg p-2 pl-4">
                <code className="font-mono text-[14px] text-primary truncate max-w-[280px]">
                  {shareLink}
                </code>
                <button 
                  onClick={handleCopy}
                  className="bg-white border border-border-light px-3 py-1.5 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-2 text-slate-600 text-[14px] font-medium shrink-0 shadow-sm"
                >
                  {copied ? <Check size={18} className="text-success" /> : <Copy size={18} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              {/* Expiry Info */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2 text-warning">
                  <Timer size={18} />
                  <span className="text-[14px] font-medium">
                    Expires in {expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : expiresInMinutes} min
                  </span>
                </div>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[12px] font-semibold tracking-wider uppercase border border-slate-200">
                  {expiresInMinutes} Min Limit
                </span>
              </div>
            </div>
          )}

          {revoked && (
            <div className="text-center py-6 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-danger-bg text-danger flex items-center justify-center mx-auto mb-4 border border-danger-border">
                <Ban size={32} />
              </div>
              <h3 className="text-[18px] font-bold text-slate-900 mb-2">Link Revoked</h3>
              <p className="text-[14px] text-slate-500">
                The secure link has been immediately disabled and can no longer be accessed.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-[28px] py-5 border-t border-border-light bg-slate-50 flex items-center justify-between mt-auto">
          {!shareLink && !revoked ? (
            <>
              <Button variant="ghost" onClick={onClose} className="border-[1.5px] border-border-light bg-white text-slate-700 font-medium">
                Cancel
              </Button>
              <Button onClick={handleGenerate} isLoading={loading} variant="primary" className="font-medium shadow-[0_4px_14px_0_rgba(79,70,229,0.39)]">
                Generate Link
              </Button>
            </>
          ) : (
            <>
              {!revoked ? (
                <Button 
                  variant="dangerGhost" 
                  onClick={handleRevoke} 
                  disabled={revoking}
                  className="bg-white border-[1.5px] border-danger/30 text-danger hover:bg-danger-bg font-medium"
                >
                  <Ban size={18} className="mr-2" />
                  {revoking ? "Revoking..." : "Revoke Link"}
                </Button>
              ) : (
                <div></div> // Empty div for spacing
              )}
              <Button onClick={onClose} variant="primary" className="font-medium shadow-[0_4px_14px_0_rgba(79,70,229,0.39)]">
                Done
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
