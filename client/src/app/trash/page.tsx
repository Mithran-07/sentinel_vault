"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/context/VaultContext";
import { decryptItem } from "@/lib/crypto";
import { api } from "@/lib/api";
import { ItemPayload, TYPE_LABELS, ItemType } from "@/components/ItemModal";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { 
  Trash2, 
  Key, 
  CreditCard, 
  FileText, 
  Lock, 
  Info, 
  RotateCcw, 
  AlertTriangle,
  User,
  Code,
  Terminal
} from "lucide-react";

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

const TYPE_ICONS: Record<string, any> = {
  LOGIN: Key,
  SECURE_NOTE: FileText,
  CARD: CreditCard,
  IDENTITY: User,
  SSH_KEY: Code,
  API_CREDENTIAL: Terminal,
};

export default function TrashPage() {
  const router = useRouter();
  const { toast } = { toast: useToast() };
  const { vaultKey, activeWalletId } = useVault();
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
      return;
    }
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
      if (!res.ok) throw new Error("Failed to load trash");
      const records: VaultItemRecord[] = await res.json();
      const decrypted = await Promise.all(
        records.map(async (r) => ({
          id: r.id,
          deletedAt: r.deletedAt,
          data: await decryptItem<ItemPayload>({ ciphertext: r.ciphertext, iv: r.iv }, vaultKey),
        }))
      );
      setItems(decrypted);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to decrypt trash contents");
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(id: string, name: string) {
    setRestoringId(id);
    try {
      const res = await api.post(`/vault/items/${id}/restore`, {});
      if (!res.ok) throw new Error("Failed to restore item");
      toast.success(`Restored "${name}" to active vault`);
      await loadTrash();
    } catch (e: any) {
      toast.error(e.message || "Failed to restore");
    } finally {
      setRestoringId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      const res = await api.del(`/vault/items/${deleteConfirmId}/permanent`);
      if (!res.ok) throw new Error("Permanent deletion failed");
      toast.success("Credential permanently erased");
      await loadTrash();
    } catch (e: any) {
      toast.error(e.message || "Failed to permanently delete item");
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  }

  return (
    <AppShell pageTitle="Trash & Recovery">
      <div className="max-w-5xl mx-auto">
        {/* Retention Policy Banner */}
        <div className="p-4 rounded-xl border border-line bg-surface-2/40 mb-6 flex items-start gap-3">
          <Info className="text-accent mt-0.5 shrink-0" size={18} />
          <div className="text-xs leading-relaxed">
            <span className="font-semibold text-fg">Soft-Delete Retention Policy: </span>
            <span className="text-fg-muted">
              Items remain in the trash encrypted with your vault key until permanently purged or restored. Server operators cannot read or reconstruct item contents even in deleted states.
            </span>
          </div>
        </div>

        {/* Content Table */}
        {loading ? (
          <div className="panel p-6 space-y-3">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="panel p-12 text-center max-w-md mx-auto flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-4 text-fg-subtle">
              <Trash2 size={26} />
            </div>
            <h3 className="font-display text-base font-bold text-fg mb-1">Trash is empty</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              When you delete credentials from your vault, they will appear here before being permanently purged.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-surface-2/50 border-b border-line text-[11px] font-mono uppercase tracking-wider text-fg-subtle">
              <div className="col-span-6 sm:col-span-5">Deleted Credential</div>
              <div className="col-span-3 hidden sm:block">Date Trashed</div>
              <div className="col-span-6 sm:col-span-4 text-right">Actions</div>
            </div>

            <div className="divide-y divide-line text-xs">
              {items.map((item) => {
                const Icon = TYPE_ICONS[item.data.type] || Lock;
                const deletedDate = new Date(item.deletedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-surface-2/40 transition-colors"
                  >
                    <div className="col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center shrink-0 text-fg-subtle">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 truncate">
                        <div className="font-semibold text-fg-muted line-through truncate">
                          {item.data.name}
                        </div>
                        <div className="text-[10px] font-mono text-fg-subtle uppercase">
                          {TYPE_LABELS[item.data.type as ItemType]}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-3 hidden sm:block text-fg-subtle font-mono text-[11px]">
                      {deletedDate}
                    </div>

                    <div className="col-span-6 sm:col-span-4 flex justify-end items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={restoringId === item.id}
                        onClick={() => handleRestore(item.id, item.data.name)}
                      >
                        <RotateCcw size={13} className="mr-1" />
                        <span>Restore</span>
                      </Button>
                      <Button
                        variant="dangerGhost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(item.id)}
                      >
                        <Trash2 size={13} className="mr-1" />
                        <span>Purge</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Permanent Delete Modal */}
      {deleteConfirmId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative bg-surface border border-line rounded-2xl shadow-pop w-full max-w-sm p-6 text-center animate-pop-in">
            <div className="w-12 h-12 rounded-xl bg-danger/15 text-danger border border-danger/35 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} />
            </div>
            <h3 className="font-display text-base font-bold text-fg mb-1">
              Permanently Purge?
            </h3>
            <p className="text-xs text-fg-muted mb-5 leading-relaxed">
              This action cannot be undone. The ciphertext will be permanently expunged from the database and cannot be recovered.
            </p>
            <div className="flex gap-2.5">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={confirmDelete}
                isLoading={isDeleting}
              >
                Delete Forever
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
