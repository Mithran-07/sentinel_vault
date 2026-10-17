"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { 
  ShieldCheck, 
  AlertTriangle, 
  PlusCircle, 
  Lock, 
  Download, 
  RefreshCw, 
  Terminal, 
  Link as LinkIcon, 
  Key,
  KeyRound,
  CheckCircle2,
  Calendar,
  Layers
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

interface AuditEvent {
  id: string;
  eventType: string;
  createdAt: string;
  metadata: Record<string, any>;
}

export default function AuditPage() {
  const { toast } = { toast: useToast() };
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("ALL");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [eventsRes, verifyRes] = await Promise.allSettled([
        api.get("/audit"),
        api.get("/audit/verify"),
      ]);

      if (eventsRes.status === "fulfilled" && eventsRes.value.ok) {
        setEvents(await eventsRes.value.json());
      }
      if (verifyRes.status === "fulfilled" && verifyRes.value.ok) {
        const verify = await verifyRes.value.json();
        setChainValid(verify.valid);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to load audit trail");
    } finally {
      setLoading(false);
    }
  }

  function handleExportCsv() {
    if (events.length === 0) return;
    const headers = ["ID", "Timestamp", "EventType", "Metadata"];
    const rows = events.map((e) => [
      e.id,
      e.createdAt,
      e.eventType,
      JSON.stringify(e.metadata || {}).replace(/"/g, '""'),
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => `"${r.join('","')}"`)].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sentinel-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Audit log exported to CSV");
  }

  const getEventBadge = (type: string) => {
    if (type.includes("FAIL") || type.includes("ERROR") || type.includes("DENIED")) {
      return "bg-danger/15 text-danger border-danger/30";
    }
    if (type.includes("LOGIN") || type.includes("AUTH") || type.includes("SESSION")) {
      return "bg-accent/15 text-accent border-accent/30";
    }
    if (type.includes("CREATE") || type.includes("RESTORE") || type.includes("ADD")) {
      return "bg-lime/15 text-lime border-lime/30";
    }
    return "bg-uv/15 text-uv border-uv/30";
  };

  const filteredEvents = events.filter((e) => {
    if (filterType === "ALL") return true;
    if (filterType === "AUTH") return e.eventType.includes("LOGIN") || e.eventType.includes("AUTH") || e.eventType.includes("SESSION");
    if (filterType === "VAULT") return e.eventType.includes("ITEM") || e.eventType.includes("VAULT");
    if (filterType === "SECURITY") return e.eventType.includes("MFA") || e.eventType.includes("PASSKEY") || e.eventType.includes("RECOVERY");
    return true;
  });

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={handleExportCsv} disabled={events.length === 0}>
        <Download size={14} className="mr-1.5" />
        <span>Export CSV</span>
      </Button>
      <Button variant="secondary" size="sm" onClick={load} isLoading={loading}>
        <RefreshCw size={14} className="mr-1.5" />
        <span>Verify Chain</span>
      </Button>
    </div>
  );

  return (
    <AppShell pageTitle="Audit & Integrity Ledger" headerActions={headerActions}>
      <div className="max-w-6xl mx-auto">
        {/* Verification Banner */}
        {chainValid !== null && (
          <div
            className={`p-4 rounded-xl border mb-6 flex items-start gap-3.5 transition-all ${
              chainValid
                ? "bg-lime/10 border-lime/30 text-fg"
                : "bg-danger/10 border-danger/30 text-fg"
            }`}
          >
            <div
              className={`p-2 rounded-lg shrink-0 ${
                chainValid ? "bg-lime/20 text-lime" : "bg-danger/20 text-danger"
              }`}
            >
              {chainValid ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-display text-sm font-bold text-fg">
                  {chainValid ? "Cryptographic Hash Chain Verified" : "Chain Integrity Anomaly Detected"}
                </h4>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase border ${
                    chainValid ? "bg-lime/15 text-lime border-lime/35" : "bg-danger/15 text-danger border-danger/35"
                  }`}
                >
                  {chainValid ? "SHA-256 Valid" : "Tamper Alert"}
                </span>
              </div>
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                {chainValid
                  ? "Every event below is sequentially hashed into an immutable cryptographic chain. Any modification or truncation is mathematically detectable."
                  : "Cryptographic validation failed. One or more events have broken hash-linkage or metadata corruption."}
              </p>
            </div>
          </div>
        )}

        {/* Filter pills */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "ALL", label: "All Events" },
              { id: "AUTH", label: "Authentication & Sessions" },
              { id: "VAULT", label: "Vault Item Operations" },
              { id: "SECURITY", label: "Passkeys & MFA" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  filterType === f.id
                    ? "bg-accent/15 border-accent/35 text-accent font-semibold"
                    : "bg-surface-2/40 border-line text-fg-muted hover:text-fg"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-fg-subtle font-mono hidden sm:inline">
            {filteredEvents.length} events logged
          </span>
        </div>

        {/* Events Ledger */}
        {loading && events.length === 0 ? (
          <div className="panel p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="panel p-12 text-center max-w-md mx-auto flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3 text-fg-subtle">
              <Terminal size={26} />
            </div>
            <h3 className="font-display text-base font-bold text-fg mb-1">No events recorded</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              System events, logins, item creations, and cryptographic verifications will be logged here.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-surface-2/50 border-b border-line text-[11px] font-mono uppercase tracking-wider text-fg-subtle">
              <div className="col-span-3">Timestamp / Hash ID</div>
              <div className="col-span-3">Action Type</div>
              <div className="col-span-2 hidden md:block">Origin / IP</div>
              <div className="col-span-6 md:col-span-4 text-right">Event Payload</div>
            </div>

            <div className="divide-y divide-line text-xs">
              {filteredEvents.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-surface-2/30 transition-colors"
                >
                  {/* Timestamp & short hash */}
                  <div className="col-span-3 min-w-0">
                    <div className="font-medium text-fg text-xs truncate">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-[11px] text-fg-subtle font-mono">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </div>
                    <span className="text-[9px] font-mono text-fg-subtle truncate block max-w-[120px]" title={e.id}>
                      {e.id.slice(0, 10)}...
                    </span>
                  </div>

                  {/* Event Type Badge */}
                  <div className="col-span-3 min-w-0">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide border ${getEventBadge(
                        e.eventType
                      )}`}
                    >
                      {e.eventType}
                    </span>
                  </div>

                  {/* Origin IP */}
                  <div className="col-span-2 hidden md:block text-fg-muted font-mono text-[11px] truncate">
                    {e.metadata?.ip || e.metadata?.ipAddress || "127.0.0.1"}
                  </div>

                  {/* Payload Details */}
                  <div className="col-span-6 md:col-span-4 text-right">
                    <pre className="font-mono text-[11px] text-fg-muted bg-surface-2/60 border border-line px-2.5 py-1.5 rounded-lg truncate text-left max-w-full overflow-hidden inline-block w-full">
                      {JSON.stringify(e.metadata || {})}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
