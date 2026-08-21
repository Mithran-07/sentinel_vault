"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Shield, Link as LinkIcon, AlertCircle, PlusCircle, Lock, Download, RefreshCw, Terminal, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";

interface AuditEvent {
  id: string;
  eventType: string;
  createdAt: string;
  metadata: Record<string, any>;
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [eventsRes, verifyRes] = await Promise.all([api.get("/audit"), api.get("/audit/verify")]);
      setEvents(await eventsRes.json());
      const verify = await verifyRes.json();
      setChainValid(verify.valid);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const getEventIcon = (type: string) => {
    if (type.includes("LOGIN") || type.includes("AUTH")) return <Shield size={16} className="text-primary" />;
    if (type.includes("FAIL") || type.includes("ERROR")) return <AlertCircle size={16} className="text-danger" />;
    if (type.includes("CREATE") || type.includes("ADD")) return <PlusCircle size={16} className="text-success" />;
    return <Lock size={16} className="text-slate-500" />;
  };

  const getEventColor = (type: string) => {
    if (type.includes("FAIL") || type.includes("ERROR")) return "bg-danger text-white";
    if (type.includes("LOGIN") || type.includes("AUTH")) return "bg-primary text-white";
    if (type.includes("CREATE") || type.includes("ADD")) return "bg-success text-white";
    return "bg-slate-200 text-slate-700";
  };

  const headerActions = (
    <div className="flex items-center gap-4">
      <Button variant="ghost" onClick={load} isLoading={loading}>
        <RefreshCw size={20} className="mr-2" />
        Refresh Chain
      </Button>
    </div>
  );

  return (
    <AppShell pageTitle="Audit Log" headerActions={headerActions}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <p className="text-[14px] text-slate-500 mt-2">Immutable, cryptographically verifiable record of all system events.</p>
        </div>

        {/* Info Bar */}
        {chainValid !== null && (
          <div className={`border rounded-xl p-4 mb-8 flex items-start gap-4 ${chainValid ? "bg-primary-light border-primary-border" : "bg-danger-bg border-danger-border"}`}>
            <div className={`rounded-full p-2 flex shrink-0 ${chainValid ? "bg-primary text-white" : "bg-danger text-white"}`}>
              {chainValid ? <LinkIcon size={24} /> : <AlertCircle size={24} />}
            </div>
            <div>
              <h4 className={`text-[16px] font-semibold mb-1 ${chainValid ? "text-primary-dark" : "text-danger-text"}`}>
                {chainValid ? "Cryptographic Chain Verified" : "Chain Tampering Detected"}
              </h4>
              <p className="text-[14px] text-slate-700">
                {chainValid 
                  ? "All events displayed are sequentially hashed and anchored to the enterprise ledger. No tampering detected." 
                  : "WARNING: Cryptographic verification failed. The audit log has been maliciously modified."}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="ml-auto">
            <Button variant="ghost" className="text-slate-600 hover:text-primary">
              <Download size={18} className="mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Audit Table */}
        <div className="bg-surface rounded-xl border border-border-light overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-border-light bg-slate-50">
            <div className="col-span-3 text-[12px] font-semibold tracking-wider text-slate-500 uppercase">Timestamp / Hash</div>
            <div className="col-span-3 text-[12px] font-semibold tracking-wider text-slate-500 uppercase">Event</div>
            <div className="col-span-2 text-[12px] font-semibold tracking-wider text-slate-500 uppercase">Actor / IP</div>
            <div className="col-span-4 text-[12px] font-semibold tracking-wider text-slate-500 uppercase">Resource Details</div>
          </div>

          {/* Body */}
          <div className="relative p-6 pt-2 min-h-[300px]">
            {events.length > 0 && <div className="absolute left-10 top-6 bottom-6 w-px border-l-2 border-dashed border-slate-200 z-0"></div>}
            
            {loading && events.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                 <RefreshCw size={32} className="animate-spin mb-4 text-primary" />
                 <p className="text-[14px] font-medium">Verifying cryptographic chain...</p>
               </div>
            ) : events.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                 <Terminal size={32} className="mb-4 opacity-50 block text-primary" />
                 <p className="text-[14px] font-medium">No audit events recorded yet.</p>
               </div>
            ) : (
              events.map((e) => (
                <div key={e.id} className="relative z-10 grid grid-cols-12 gap-4 items-center py-4 border-b border-border-light/50 last:border-0 hover:bg-slate-50/50 transition-colors -mx-6 px-6">
                  {/* Timestamp & Hash */}
                  <div className="col-span-3 flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-surface border-2 border-slate-200 flex items-center justify-center shrink-0 z-10">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                    </div>
                    <div>
                      <div className="text-[14px] font-medium text-slate-900">{new Date(e.createdAt).toLocaleDateString()}</div>
                      <div className="text-[12px] text-slate-500">{new Date(e.createdAt).toLocaleTimeString()}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1 bg-slate-100 px-1 py-0.5 rounded truncate max-w-[120px]" title={e.id}>
                        {e.id.substring(0, 12)}...
                      </div>
                    </div>
                  </div>

                  {/* Event Type */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-2 mb-1">
                      {getEventIcon(e.eventType)}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase ${getEventColor(e.eventType)}`}>
                        {e.eventType}
                      </span>
                    </div>
                  </div>

                  {/* Actor */}
                  <div className="col-span-2">
                    <div className="text-[14px] font-medium text-slate-900 truncate">
                      {e.metadata?.user || e.metadata?.email || "System"}
                    </div>
                    <div className="text-[12px] text-slate-500 truncate">
                      {e.metadata?.ip || "127.0.0.1"}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="col-span-4">
                    <div className="text-[13px] text-slate-600 bg-slate-50 border border-slate-100 rounded p-2 font-mono break-all line-clamp-2 hover:line-clamp-none transition-all">
                      {JSON.stringify(e.metadata || {})}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
