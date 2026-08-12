"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVault } from "@/context/VaultContext";
import { decryptItem } from "@/lib/crypto";
import { api } from "@/lib/api";
import { ItemPayload, TYPE_LABELS, TYPE_ICONS, ItemType } from "@/components/ItemModal";

interface VaultItemRecord {
  id: string;
  type: string;
  ciphertext: string;
  iv: string;
  deletedAt: string;
  updatedAt: string;
}

interface DecryptedItem {
  id: string;
  deletedAt: string;
  data: ItemPayload;
}

export default function TrashPage() {
  const router = useRouter();
  const { vaultKey } = useVault();
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vaultKey) { router.replace("/login"); return; }
    void loadTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultKey]);

  async function loadTrash() {
    if (!vaultKey) return;
    setLoading(true);
    const res = await api.get("/vault/items?deleted=true");
    const records: VaultItemRecord[] = await res.json();
    const decrypted = await Promise.all(
      records.map(async (r) => ({
        id: r.id,
        deletedAt: r.deletedAt,
        data: await decryptItem<ItemPayload>({ ciphertext: r.ciphertext, iv: r.iv }, vaultKey),
      }))
    );
    setItems(decrypted);
    setLoading(false);
  }

  async function handleRestore(id: string, name: string) {
    if (!window.confirm(`Restore "${name}" to your vault?`)) return;
    await api.post(`/vault/items/${id}/restore`, {});
    await loadTrash();
  }

  async function handlePermanentDelete(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name}"? This CANNOT be undone.`)) return;
    await api.del(`/vault/items/${id}/permanent`);
    await loadTrash();
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border/50 bg-surface flex-shrink-0 flex flex-col sticky top-0 md:h-screen">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">Vault</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <Link href="/vault" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            All Items
          </Link>
          <Link href="/trash" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-accent/10 text-accent font-medium transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Trash
          </Link>
          <Link href="/health" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Security Health
          </Link>
          <Link href="/audit" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            Audit Log
          </Link>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-8 py-6 border-b border-border/50 flex items-center justify-between bg-surface/50 sticky top-0 z-10 backdrop-blur-md">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trash</h1>
            <p className="text-sm text-foreground/50 mt-0.5">Items here are soft-deleted. Restore or permanently delete them.</p>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-foreground/50">
              <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4 border border-border">
                <svg className="w-8 h-8 text-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Trash is empty</h3>
              <p className="text-foreground/60 text-sm">Deleted items will appear here. They can be restored or permanently deleted.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-border bg-surface p-4 opacity-80">
                  <div className="flex items-center gap-4 mb-4 sm:mb-0">
                    <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center text-lg shrink-0">
                      {TYPE_ICONS[item.data.type as ItemType] ?? "📄"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{item.data.name}</p>
                      <p className="text-xs text-foreground/50">
                        {TYPE_LABELS[item.data.type as ItemType]} · Deleted {new Date(item.deletedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestore(item.id, item.data.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/10 border border-accent/20 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item.id, item.data.name)}
                      className="px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-red-400 hover:text-red-300 hover:border-red-500/30 transition-colors"
                    >
                      Delete Forever
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
