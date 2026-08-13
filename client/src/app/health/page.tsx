"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVault } from "@/context/VaultContext";
import { decryptItem } from "@/lib/crypto";
import { estimateStrength } from "@/lib/generator";
import { api } from "@/lib/api";
import { ItemPayload } from "@/components/ItemModal";

interface VaultItemRecord {
  id: string;
  ciphertext: string;
  iv: string;
  updatedAt: string;
}

interface HealthItem {
  id: string;
  name: string;
  password: string;
  strength: "weak" | "fair" | "strong";
  reused: boolean;
  old: boolean;
}

const OLD_THRESHOLD_DAYS = 180;

export default function HealthPage() {
  const router = useRouter();
  const { vaultKey } = useVault();
  const [items, setItems] = useState<HealthItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultKey]);

  async function run() {
    if (!vaultKey) return;
    setLoading(true);

    // Everything below happens in the browser. Passwords never leave this tab —
    // reuse/weakness detection is a purely local comparison, not a server call.
    const res = await api.get("/vault/items");
    const records: VaultItemRecord[] = await res.json();
    const decrypted = await Promise.all(
      records.map(async (r) => ({
        record: r,
        data: await decryptItem<ItemPayload>({ ciphertext: r.ciphertext, iv: r.iv }, vaultKey),
      }))
    );

    const passwordCounts = new Map<string, number>();
    for (const { data } of decrypted) {
      const pwd = "password" in data ? data.password : undefined;
      if (!pwd) continue;
      passwordCounts.set(pwd, (passwordCounts.get(pwd) ?? 0) + 1);
    }

    const now = Date.now();
    const health: HealthItem[] = decrypted
      .filter(({ data }) => "password" in data && !!data.password)
      .map(({ record, data }) => {
        const pwd = "password" in data ? data.password as string : "";
        const ageDays = (now - new Date(record.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        return {
          id: record.id,
          name: data.name || "(untitled)",
          password: pwd,
          strength: estimateStrength(pwd),
          reused: (passwordCounts.get(pwd) ?? 0) > 1,
          old: ageDays > OLD_THRESHOLD_DAYS,
        };
      });

    setItems(health);
    setLoading(false);
  }

  const weakCount = items.filter((i) => i.strength === "weak").length;
  const reusedCount = items.filter((i) => i.reused).length;
  const oldCount = items.filter((i) => i.old).length;
  const strongCount = items.filter((i) => i.strength === "strong" && !i.reused && !i.old).length;

  const total = items.length || 1;
  const score = Math.round(
    100 * (1 - (weakCount * 1.0 + reusedCount * 0.8 + oldCount * 0.3) / (total * 2.1 || 1))
  );
  const clampedScore = Math.max(0, Math.min(100, score));

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <Link href="/vault" className="text-sm text-slate-400 hover:text-slate-200">
        &larr; Back to vault
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Password health</h1>
      <p className="mt-1 text-sm text-slate-500">
        Computed entirely in your browser from decrypted items already in memory — nothing is sent to the
        server to run this check.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Analyzing vault...</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No login items with passwords yet.</p>
      ) : (
        <>
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
            <p className="text-4xl font-bold">{clampedScore}</p>
            <p className="text-sm text-slate-500">/ 100 security score</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Reused passwords" count={reusedCount} tone={reusedCount > 0 ? "critical" : "good"} />
            <StatCard label="Weak passwords" count={weakCount} tone={weakCount > 0 ? "warning" : "good"} />
            <StatCard label={`Older than ${OLD_THRESHOLD_DAYS} days`} count={oldCount} tone={oldCount > 0 ? "warning" : "good"} />
            <StatCard label="Strong & fresh" count={strongCount} tone="good" />
          </div>

          <ul className="mt-6 space-y-2">
            {items
              .filter((i) => i.reused || i.strength === "weak" || i.old)
              .map((i) => (
                <li key={i.id} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
                  <p className="font-medium">{i.name}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {i.reused && <Badge tone="critical">Reused</Badge>}
                    {i.strength === "weak" && <Badge tone="warning">Weak</Badge>}
                    {i.old && <Badge tone="warning">Not updated in {OLD_THRESHOLD_DAYS}+ days</Badge>}
                  </div>
                </li>
              ))}
          </ul>

          <p className="mt-6 text-xs text-slate-600">
            Breach/exposure checking (e.g. k-anonymity lookups against known-leaked password hashes) is on
            the roadmap — see the Enterprise page — but isn't built here to keep the demo scope honest.
          </p>
        </>
      )}
    </main>
  );
}

function StatCard({ label, count, tone }: { label: string; count: number; tone: "critical" | "warning" | "good" }) {
  const color = tone === "critical" ? "text-red-400" : tone === "warning" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
      <p className={`text-2xl font-semibold ${color}`}>{count}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "critical" | "warning" }) {
  const color = tone === "critical" ? "border-red-700 text-red-400" : "border-amber-700 text-amber-400";
  return <span className={`rounded-full border px-2 py-0.5 ${color}`}>{children}</span>;
}
