"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVault } from "@/context/VaultContext";
import { encryptItem, decryptItem } from "@/lib/crypto";
import { api, clearTokens } from "@/lib/api";
import { ItemModal, ItemPayload } from "@/components/ItemModal";
import { OnboardingModal } from "@/components/OnboardingModal";

interface VaultItemRecord {
  id: string;
  type: string;
  ciphertext: string;
  iv: string;
  updatedAt: string;
}

interface DecryptedItem {
  id: string;
  data: ItemPayload;
}

export default function VaultPage() {
  const router = useRouter();
  const { vaultKey, email, clearSession } = useVault();
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DecryptedItem | null>(null);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
      return;
    }
    
    // Check onboarding state
    const hasSeenOnboarding = localStorage.getItem("vault_onboarding_complete");
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }

    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultKey]);

  function handleOnboardingComplete() {
    localStorage.setItem("vault_onboarding_complete", "true");
    setShowOnboarding(false);
  }

  async function loadItems() {
    if (!vaultKey) return;
    setLoading(true);
    const res = await api.get("/vault/items");
    const records: VaultItemRecord[] = await res.json();
    const decrypted = await Promise.all(
      records.map(async (r) => ({
        id: r.id,
        data: await decryptItem<ItemPayload>({ ciphertext: r.ciphertext, iv: r.iv }, vaultKey),
      }))
    );
    setItems(decrypted);
    setLoading(false);
  }

  async function handleSave(data: ItemPayload) {
    if (!vaultKey) return;
    const blob = await encryptItem(data, vaultKey);
    if (editing) {
      await api.put(`/vault/items/${editing.id}`, { ciphertext: blob.ciphertext, iv: blob.iv, type: "LOGIN" });
    } else {
      await api.post("/vault/items", { ciphertext: blob.ciphertext, iv: blob.iv, type: "LOGIN" });
    }
    setModalOpen(false);
    setEditing(null);
    await loadItems();
  }

  async function handleDelete(id: string) {
    await api.del(`/vault/items/${id}`);
    await loadItems();
  }

  function logout() {
    clearTokens();
    clearSession();
    router.push("/login");
  }

  function handleCopyPassword(id: string, password: string) {
    navigator.clipboard.writeText(password);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filtered = items.filter((i) => i.data.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
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
          <div className="text-sm font-medium text-foreground truncate">{email}</div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <Link href="/vault" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-accent/10 text-accent font-medium transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            All Items
          </Link>
          <Link href="/health" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Security Health
          </Link>
          <Link href="/audit" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            Audit Log
          </Link>
          <Link href="/enterprise" className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            Enterprise
          </Link>
        </nav>

        <div className="p-4 border-t border-border/50">
          <button onClick={logout} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Lock Vault
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-8 py-6 border-b border-border/50 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-surface/50 sticky top-0 z-10 backdrop-blur-md">
          <h1 className="text-2xl font-bold tracking-tight">All Items</h1>
          <div className="flex w-full sm:w-auto items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search vault..."
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              />
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="flex-shrink-0 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Item
            </button>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-foreground/50 space-y-4">
              <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <p className="text-sm font-medium">Decrypting your vault...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4 border border-border">
                <svg className="w-8 h-8 text-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Nothing here yet</h3>
              <p className="text-foreground/60 text-sm mb-6">
                {query ? "No items matched your search query. Try another term." : "Your vault is empty. Add your first login to secure it locally."}
              </p>
              {!query && (
                <button
                  onClick={() => { setEditing(null); setModalOpen(true); }}
                  className="text-accent text-sm font-medium hover:text-accent-hover transition-colors"
                >
                  + Create your first item
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-border bg-surface hover:border-border/80 hover:bg-surfaceHover transition-all p-4"
                >
                  <div className="flex items-center gap-4 mb-4 sm:mb-0">
                    <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center text-foreground/40 font-bold uppercase shrink-0">
                      {item.data.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{item.data.name}</p>
                      <p className="text-sm text-foreground/60 truncate">{item.data.username}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopyPassword(item.id, item.data.password)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-foreground/80 hover:text-foreground hover:border-accent/50 transition-colors"
                      title="Copy Password"
                    >
                      {copiedId === item.id ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          <span className="text-accent">Copied</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => { setEditing(item); setModalOpen(true); }}
                      className="px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-foreground/80 hover:text-foreground transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-red-400 hover:text-red-300 hover:border-red-500/30 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {modalOpen && (
        <ItemModal
          initial={editing?.data}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}

      {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}
    </div>
  );
}
