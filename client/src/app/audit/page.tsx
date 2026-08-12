"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVault } from "@/context/VaultContext";
import { api } from "@/lib/api";

interface AuditEvent {
  id: string;
  eventType: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);

  const router = useRouter();
  const { vaultKey } = useVault();

  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultKey]);

  async function load() {
    const [eventsRes, verifyRes] = await Promise.all([api.get("/audit"), api.get("/audit/verify")]);
    setEvents(await eventsRes.json());
    const verify = await verifyRes.json();
    setChainValid(verify.valid);
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <Link href="/vault" className="text-sm text-slate-400 hover:text-slate-200">
        &larr; Back to vault
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every event is hash-chained (SHA-256 of event + previous hash) so tampering or deletion is detectable —
        this is the same principle enterprise SIEM integrations rely on.
      </p>
      {chainValid !== null && (
        <p className={`mt-3 text-sm ${chainValid ? "text-emerald-400" : "text-red-400"}`}>
          Chain integrity: {chainValid ? "verified, unbroken" : "TAMPERING DETECTED"}
        </p>
      )}
      <ul className="mt-6 space-y-2">
        {events.map((e) => (
          <li key={e.id} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{e.eventType}</span>
              <span className="text-slate-500">{new Date(e.createdAt).toLocaleString()}</span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
