"use client";

import { useEffect, useState } from "react";
import { importShareSecret, decryptItem, EncryptedBlob } from "@/lib/crypto";
import { ItemPayload, TYPE_LABELS, ItemType } from "@/components/ItemModal";
import { Shield, ShieldCheck, AlertTriangle, Lock, Key, Copy, Check, FileText, CreditCard, Lock as LockIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function ShareRecipientPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ItemPayload | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [decryptedAt] = useState(new Date());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadShare() {
      try {
        const secretBase64Url = window.location.hash.slice(1); // remove '#'
        if (!secretBase64Url) {
          setError("Missing decryption secret in URL.");
          return;
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"}/share/${params.id}`);
        if (!res.ok) {
          if (res.status === 410) {
            const body = await res.json().catch(() => ({}));
            setError(body.error || "This secure link has expired or been revoked.");
          } else if (res.status === 404) {
            setError("Secure link not found.");
          } else {
            setError("Failed to load secure credential.");
          }
          return;
        }

        const body = await res.json();
        const shareKey = importShareSecret(secretBase64Url);
        const blob: EncryptedBlob = { ciphertext: body.ciphertext, iv: body.iv };

        const payload = await decryptItem<ItemPayload>(blob, shareKey);
        
        setData(payload);
        setExpiresAt(new Date(body.expiresAt));
      } catch (err) {
        console.error(err);
        setError("Unable to decrypt this secure credential.");
      } finally {
        setLoading(false);
      }
    }
    loadShare();
  }, [params.id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "LOGIN": return <Key size={24} className="text-primary" />;
      case "CARD": return <CreditCard size={24} className="text-primary" />;
      case "SECURE_NOTE": return <FileText size={24} className="text-primary" />;
      default: return <LockIcon size={24} className="text-primary" />;
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500 max-w-md w-full bg-white p-[28px] rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center relative overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-primary/10 animate-pulse" />
            <Shield className="w-8 h-8 text-primary relative z-10" />
          </div>
          <div className="text-center">
            <h2 className="text-[20px] font-bold text-slate-900 mb-2">Decrypting Credential</h2>
            <p className="text-[14px] text-slate-500">
              Your browser is decrypting this payload locally. The server cannot see this credential.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative overflow-hidden">
        {/* Abstract background blobs for error state */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-danger-bg rounded-full blur-[100px] opacity-60 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-200 rounded-full blur-[100px] opacity-40 translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

        <div className="flex flex-col items-center text-center max-w-[440px] w-full bg-white border border-slate-100 rounded-[24px] p-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] animate-in fade-in slide-in-from-bottom-4 relative z-10">
          <div className="w-16 h-16 rounded-full bg-danger-bg text-danger flex items-center justify-center mb-6 border-4 border-white shadow-sm">
            <AlertTriangle size={32} />
          </div>
          <h1 className="text-[24px] font-bold text-slate-900 mb-3">Access Denied</h1>
          <p className="text-[15px] text-slate-600 mb-8">{error}</p>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-[13px] text-slate-500 w-full flex gap-3 text-left">
            <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              This is a zero-knowledge shared credential. The link may have expired (10 min maximum), been revoked by the owner, or is missing its fragment secret.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4 flex justify-center relative overflow-hidden">
      {/* Abstract background blobs for success state */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-light rounded-full blur-[120px] opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-success-bg rounded-full blur-[100px] opacity-40 translate-y-1/3 -translate-x-1/3 pointer-events-none"></div>

      <div className="max-w-[600px] w-full animate-in fade-in slide-in-from-bottom-4 relative z-10 mt-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-[24px] rounded-[20px] shadow-[0_2px_10px_rgb(0,0,0,0.03)] border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-light border border-primary/10 flex items-center justify-center text-primary shadow-sm shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-slate-900">Sentinel Vault</h1>
              <p className="text-[13px] font-semibold tracking-wider uppercase text-success flex items-center gap-1.5 mt-1">
                <Lock size={14} /> End-to-end encrypted
              </p>
            </div>
          </div>
          {expiresAt && (
            <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 flex items-center gap-2 self-start md:self-auto shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-warning"></span>
              </span>
              Valid until {expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* Content Card */}
        <div className="bg-white border border-border-light shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-[24px] overflow-hidden">
          
          <div className="px-[32px] py-6 border-b border-border-light bg-slate-50/50 flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white border border-border-light flex items-center justify-center shadow-sm shrink-0">
              {getIcon(data.type)}
            </div>
            <div className="truncate">
              <h2 className="text-[22px] font-bold text-slate-900 truncate mb-1">{data.name || "Unnamed Credential"}</h2>
              <p className="text-[14px] text-slate-500">
                {TYPE_LABELS[data.type as ItemType] || "Secure Credential"}
              </p>
            </div>
          </div>

          <div className="p-[32px] space-y-6">
            {"username" in data && data.username && (
              <div>
                <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Username</label>
                <div className="flex bg-slate-50 border border-border-light rounded-xl px-4 py-3 text-[15px] text-slate-900 font-medium">
                  {data.username}
                </div>
              </div>
            )}
            
            {"password" in data && data.password && (
              <div>
                <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Password</label>
                <div className="flex items-center justify-between bg-slate-50 border border-border-light rounded-xl px-4 py-2 relative group min-h-[52px]">
                  <div className="text-[15px] font-mono text-slate-900 break-all pr-24 py-1">
                    {data.password}
                  </div>
                  <Button 
                    variant="ghost"
                    onClick={() => handleCopy(data.password!)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 px-3 bg-white border border-border-light shadow-sm text-slate-700"
                  >
                    {copied ? <Check size={16} className="text-success mr-1.5" /> : <Copy size={16} className="mr-1.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}
            
            {"url" in data && data.url && (
              <div>
                <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">URL</label>
                <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark hover:underline text-[15px] truncate block font-medium">
                  {data.url}
                </a>
              </div>
            )}
            
            {"content" in data && data.content && (
              <div>
                <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Secure Note</label>
                <div className="bg-slate-50 border border-border-light rounded-xl p-5 text-[14px] text-slate-800 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto">
                  {data.content}
                </div>
              </div>
            )}
            
            {"notes" in data && data.notes && (
              <div>
                <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Additional Notes</label>
                <div className="bg-slate-50 border border-border-light rounded-xl p-5 text-[15px] text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto">
                  {data.notes}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-center text-[13px] text-slate-500 flex flex-col items-center gap-2">
          <Shield className="w-5 h-5 text-slate-300" />
          <p className="leading-relaxed max-w-sm">
            Decrypted locally at {decryptedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.<br/>
            This page is view-only and will not auto-refresh.
          </p>
        </div>
      </div>
    </main>
  );
}
