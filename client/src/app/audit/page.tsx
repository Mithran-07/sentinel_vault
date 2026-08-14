"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Shield, ShieldAlert, ShieldCheck, ArrowLeft, Activity, Clock, Terminal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

interface AuditEvent {
  id: string;
  eventType: string;
  createdAt: string;
  metadata: Record<string, unknown>;
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
    if (type.includes("LOGIN") || type.includes("AUTH")) return <Shield className="w-4 h-4 text-blue-400" />;
    if (type.includes("FAIL") || type.includes("ERROR")) return <ShieldAlert className="w-4 h-4 text-destructive" />;
    if (type.includes("CREATE") || type.includes("ADD")) return <Activity className="w-4 h-4 text-emerald-400" />;
    return <Terminal className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-12 animate-in fade-in duration-500">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/vault">
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to vault
          </Button>
        </Link>
        {chainValid !== null && (
          <Badge variant={chainValid ? "outline" : "destructive"} className="flex items-center gap-1.5">
            {chainValid ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Chain Verified</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Tampering Detected</span>
              </>
            )}
          </Badge>
        )}
      </div>
      
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Audit Logs</h1>
        <p className="text-muted-foreground">
          Every event is cryptographically hash-chained (SHA-256 of event + previous hash) ensuring absolute integrity.
        </p>
      </div>
      
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-surfaceHover/50 flex justify-between items-center">
          <h2 className="font-semibold text-sm">Event Stream</h2>
          <Button variant="outline" size="sm" onClick={load} isLoading={loading}>
            Refresh Chain
          </Button>
        </div>
        
        <div className="p-6">
          {loading ? (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-surface shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <Skeleton className="w-4 h-4 rounded-full" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-background shadow-sm">
                    <Skeleton className="h-4 w-1/3 mb-2" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Terminal className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p>No audit events recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              {events.map((e, index) => (
                <div key={e.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${index * 50}ms` }}>
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-surface shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 transition-transform group-hover:scale-110">
                    {getEventIcon(e.eventType)}
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-background shadow-sm hover:shadow-md transition-shadow hover:border-accent/30 group-hover:-translate-y-1 duration-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-foreground">{e.eventType}</span>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground mb-3">
                      <Clock className="w-3 h-3 mr-1" />
                      {new Date(e.createdAt).toLocaleString()}
                    </div>
                    {e.metadata && Object.keys(e.metadata).length > 0 && (
                      <div className="bg-surface rounded-md p-2 border border-border/50 text-[11px] font-mono text-muted-foreground/80 overflow-x-auto">
                        <pre>{JSON.stringify(e.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

