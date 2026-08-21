"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/context/VaultContext";
import { encryptItem, decryptItem } from "@/lib/crypto";
import { api } from "@/lib/api";
import { ItemModal, ItemPayload } from "@/components/ItemModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { ShareModal } from "@/components/ShareModal";
import { AppShell } from "@/components/AppShell";
import { Search, Plus, Inbox, Copy, Check, MoreVertical, Code, Cloud, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface VaultItemRecord {
  id: string;
  type: string;
  ciphertext: string;
  iv: string;
  updatedAt: string;
  walletId: string;
}

interface DecryptedItem {
  id: string;
  data: ItemPayload;
  walletId: string;
  updatedAt: string;
}

export default function VaultPage() {
  const router = useRouter();
  const { vaultKey, activeWalletId, wallets } = useVault();
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DecryptedItem | null>(null);
  const [sharing, setSharing] = useState<DecryptedItem | null>(null);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
      return;
    }
    
    const hasSeenOnboarding = localStorage.getItem("vault_onboarding_complete");
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }

    if (activeWalletId) {
      void loadItems();
    } else {
      setItems([]);
      setLoading(false);
    }
  }, [vaultKey, activeWalletId, router]);

  function handleOnboardingComplete() {
    localStorage.setItem("vault_onboarding_complete", "true");
    setShowOnboarding(false);
  }

  async function loadItems() {
    if (!vaultKey || !activeWalletId) return;
    setLoading(true);
    try {
      const res = await api.get(`/vault/items?walletId=${activeWalletId}`);
      const records: VaultItemRecord[] = await res.json();
      const decrypted = await Promise.all(
        records.map(async (r) => ({
          id: r.id,
          walletId: r.walletId,
          updatedAt: r.updatedAt,
          data: await decryptItem<ItemPayload>({ ciphertext: r.ciphertext, iv: r.iv }, vaultKey),
        }))
      );
      setItems(decrypted);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(data: ItemPayload, targetWalletId?: string) {
    if (!vaultKey || !activeWalletId) return;
    const blob = await encryptItem(data, vaultKey);
    if (editing) {
      await api.put(`/vault/items/${editing.id}`, { 
        ciphertext: blob.ciphertext, 
        iv: blob.iv, 
        type: data.type,
        walletId: targetWalletId || activeWalletId
      });
    } else {
      await api.post("/vault/items", { 
        ciphertext: blob.ciphertext, 
        iv: blob.iv, 
        type: data.type, 
        walletId: targetWalletId || activeWalletId 
      });
    }
    setModalOpen(false);
    setEditing(null);
    await loadItems();
  }

  function handleDeleteClick(id: string) {
    setDeleteConfirmId(id);
    setMenuOpenId(null);
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await api.del(`/vault/items/${deleteConfirmId}`);
      await loadItems();
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  }

  function handleCopyPassword(id: string, password: string) {
    navigator.clipboard.writeText(password);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filtered = items.filter((i) => i.data.name.toLowerCase().includes(query.toLowerCase()));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) {
      window.addEventListener("click", handleClick);
    }
    return () => window.removeEventListener("click", handleClick);
  }, [menuOpenId]);

  const activeWallet = wallets.find(w => w.id === activeWalletId);

  const headerActions = (
    <div className="flex items-center gap-4 w-full">
      <div className="relative group w-full max-w-[300px] lg:max-w-md hidden sm:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-slate-50 border-[1.5px] border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-[14px] text-slate-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-slate-400"
          placeholder="Search Vault..."
          type="text"
        />
      </div>
      <Button 
        onClick={() => { setEditing(null); setModalOpen(true); }}
        variant="primary" 
        className="shrink-0"
      >
        <Plus size={20} className="mr-1.5" />
        New Credential
      </Button>
    </div>
  );

  return (
    <AppShell pageTitle="All Items" headerActions={headerActions}>
      <div className="mb-8">
        <p className="text-slate-500 text-[14px] mt-1">Manage and securely store your digital identities.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-4">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <p className="text-[14px] font-medium">Decrypting your vault...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-primary-light text-primary flex items-center justify-center mb-6 border border-primary-border">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-[18px] font-bold text-slate-900 mb-2">Nothing here yet</h3>
          <p className="text-[14px] text-slate-500 mb-6 leading-relaxed">
            {query ? "No items matched your search query. Try another term." : "Your vault is empty. Add your first login to secure it locally before it's ever synced."}
          </p>
          {!query && (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} variant="primary">
              <Plus size={20} className="mr-1.5" />
              Create your first item
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-slate-50">
                <th className="py-4 px-6 text-[12px] font-semibold tracking-wider text-slate-500 uppercase">Name</th>
                <th className="py-4 px-6 text-[12px] font-semibold tracking-wider text-slate-500 uppercase hidden sm:table-cell">Username</th>
                <th className="py-4 px-6 text-[12px] font-semibold tracking-wider text-slate-500 uppercase hidden md:table-cell">Wallet</th>
                <th className="py-4 px-6 text-[12px] font-semibold tracking-wider text-slate-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {filtered.map((item) => {
                const isLogin = "password" in item.data;
                const iconBg = isLogin ? "bg-slate-100" : "bg-orange-50";
                const iconColor = isLogin ? "text-slate-600" : "text-orange-600";
                const iconBorder = isLogin ? "border-slate-200" : "border-orange-100";
                const IconComp = isLogin ? Code : Cloud;

                return (
                  <tr 
                    key={item.id} 
                    className="hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={(e) => { 
                      if (!(e.target as HTMLElement).closest("button")) {
                        setEditing(item); 
                        setModalOpen(true); 
                      }
                    }}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${iconBg} ${iconColor} ${iconBorder} shrink-0`}>
                          <IconComp size={20} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[16px] font-medium text-slate-900 truncate">{item.data.name}</div>
                          <div className="text-[14px] text-slate-500 truncate max-w-[200px] sm:hidden">
                            {"username" in item.data ? item.data.username : item.data.type}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-[14px] text-slate-900 hidden sm:table-cell truncate max-w-[200px]">
                      {"username" in item.data ? item.data.username : item.data.type}
                    </td>
                    <td className="py-4 px-6 hidden md:table-cell">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[12px] font-semibold tracking-wider uppercase border border-slate-200 truncate max-w-[150px]">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${activeWallet?.isDefault ? 'bg-success' : 'bg-primary'}`} />
                        {activeWallet?.name || "Main Vault"}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right relative">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {"password" in item.data && item.data.password && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleCopyPassword(item.id, (item.data as any).password); }}
                            className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-primary-light"
                            title="Copy Password"
                          >
                            {copiedId === item.id ? <Check size={20} className="text-success" /> : <Copy size={20} />}
                          </button>
                        )}
                        <div className="relative">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setMenuOpenId(menuOpenId === item.id ? null : item.id);
                            }}
                            className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-primary-light"
                          >
                            <MoreVertical size={20} />
                          </button>
                          
                          {/* Dropdown Menu */}
                          {menuOpenId === item.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-border-light rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setEditing(item); setModalOpen(true); setMenuOpenId(null); }}
                                className="w-full text-left px-4 py-2 text-[14px] text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                Edit Credential
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setSharing(item); setMenuOpenId(null); }}
                                className="w-full text-left px-4 py-2 text-[14px] text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                Share...
                              </button>
                              <div className="h-px bg-border-light my-1" />
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id); }}
                                className="w-full text-left px-4 py-2 text-[14px] text-danger hover:bg-danger-bg transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {modalOpen && (
        <ItemModal
          initial={editing?.data}
          initialWalletId={editing?.walletId}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}

      {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}

      {sharing && (
        <ShareModal
          vaultItemId={sharing.id}
          data={sharing.data}
          onClose={() => setSharing(null)}
        />
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white border border-border-light rounded-[20px] shadow-xl overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-danger-bg text-danger flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h2 className="text-[20px] font-bold text-slate-900 mb-2">Delete credential?</h2>
              <p className="text-[14px] text-slate-500 mb-6">
                This credential will be moved to the trash. You can restore it later if needed.
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  variant="danger"
                  className="w-full h-11"
                >
                  {isDeleting ? "Deleting..." : "Move to Trash"}
                </Button>
                <Button
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={isDeleting}
                  variant="ghost"
                  className="w-full h-11"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
