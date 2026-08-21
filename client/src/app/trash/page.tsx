"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/context/VaultContext";
import { decryptItem } from "@/lib/crypto";
import { api } from "@/lib/api";
import { ItemPayload, TYPE_LABELS, ItemType } from "@/components/ItemModal";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Trash2, Key, CreditCard, FileText, Lock, Info, RotateCcw } from "lucide-react";

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
  const { vaultKey, activeWalletId } = useVault();
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!vaultKey) { router.replace("/login"); return; }
    if (activeWalletId) {
      void loadTrash();
    } else {
      setItems([]);
      setLoading(false);
    }
  }, [vaultKey, activeWalletId, router]);

  async function loadTrash() {
    if (!vaultKey || !activeWalletId) return;
    setLoading(true);
    try {
      const res = await api.get(`/vault/items?deleted=true&walletId=${activeWalletId}`);
      const records: VaultItemRecord[] = await res.json();
      const decrypted = await Promise.all(
        records.map(async (r) => ({
          id: r.id,
          deletedAt: r.deletedAt,
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

  async function handleRestore(id: string, name: string) {
    if (!window.confirm(`Restore "${name}" to your vault?`)) return;
    await api.post(`/vault/items/${id}/restore`, {});
    await loadTrash();
  }

  function handleDeleteClick(id: string) {
    setDeleteConfirmId(id);
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await api.del(`/vault/items/${deleteConfirmId}/permanent`);
      await loadTrash();
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  }

  return (
    <AppShell pageTitle="Trash">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 mt-4">
            <Info className="text-amber-500 mt-0.5 shrink-0" size={20} />
            <div>
              <p className="text-[14px] text-amber-900 font-medium">Items in trash are deleted forever after 30 days.</p>
              <p className="text-[14px] text-amber-700 mt-1">You can restore them before they are permanently purged.</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-surface border border-border-light shadow-sm flex items-center justify-center mb-6">
              <Trash2 size={32} className="text-slate-400" />
            </div>
            <h3 className="text-[18px] font-bold text-slate-900 mb-2">Trash is empty</h3>
            <p className="text-[14px] text-slate-500">Deleted items will appear here. They can be restored or permanently deleted.</p>
          </div>
        ) : (
          <div className="bg-surface border border-border-light rounded-xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-border-light font-semibold tracking-wider text-[12px] text-slate-500 uppercase">
              <div className="col-span-5">Name</div>
              <div className="col-span-3">Deleted Date</div>
              <div className="col-span-4 text-right">Actions</div>
            </div>

            <div className="divide-y divide-border-light">
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-6 py-4 items-center opacity-75 hover:opacity-100 hover:bg-slate-50 transition-all group">
                  <div className="sm:col-span-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      {item.data.type === "LOGIN" ? <Key className="text-slate-400" size={20} /> : 
                       item.data.type === "CARD" ? <CreditCard className="text-slate-400" size={20} /> : 
                       item.data.type === "SECURE_NOTE" ? <FileText className="text-slate-400" size={20} /> : 
                       <Lock className="text-slate-400" size={20} />}
                    </div>
                    <div className="truncate">
                      <div className="text-[16px] font-medium text-slate-700 line-through truncate">
                        {item.data.name}
                      </div>
                      <div className="text-[14px] text-slate-500 truncate">
                        {TYPE_LABELS[item.data.type as ItemType]}
                      </div>
                    </div>
                  </div>
                  
                  <div className="sm:col-span-3">
                    <div className="text-[14px] text-slate-600">{new Date(item.deletedAt).toLocaleDateString()}</div>
                  </div>
                  
                  <div className="sm:col-span-4 flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      onClick={() => handleRestore(item.id, item.data.name)}
                      className="h-9 px-3"
                    >
                      <RotateCcw size={16} className="mr-1.5" />
                      Restore
                    </Button>
                    <Button
                      variant="dangerGhost"
                      onClick={() => handleDeleteClick(item.id)}
                      className="h-9 px-3"
                    >
                      <Trash2 size={16} className="mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white border border-border-light rounded-[20px] shadow-xl overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-danger-bg text-danger flex items-center justify-center mx-auto mb-4 border border-danger-border">
                <Trash2 size={32} />
              </div>
              <h2 className="text-[20px] font-bold text-slate-900 mb-2">Permanently delete?</h2>
              <p className="text-[14px] text-slate-500 mb-6">
                This action cannot be undone. The credential will be permanently removed from your vault.
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  variant="danger"
                  className="w-full h-11"
                >
                  {isDeleting ? "Deleting..." : "Delete Forever"}
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
