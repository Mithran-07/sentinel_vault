"use client";

import { useState } from "react";
import { useVault } from "@/context/VaultContext";
import { walletApi } from "@/lib/api";
import { Check, Plus } from "lucide-react";

export function WalletSwitcher() {
  const { wallets, activeWalletId, selectWallet, loadWallets, walletError } = useVault();
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletType, setNewWalletType] = useState("INTERNAL");
  const [editWalletName, setEditWalletName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeWallet = wallets.find((w) => w.id === activeWalletId);

  async function handleCreateWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!newWalletName.trim()) return;
    setIsSubmitting(true);
    setLocalError(null);
    try {
      const created = await walletApi.create(newWalletName, newWalletType);
      await loadWallets();
      selectWallet(created.id);
      setIsAdding(false);
      setNewWalletName("");
    } catch (err: any) {
      setLocalError(err.message || "Failed to create wallet");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!editWalletName.trim() || !activeWalletId) return;
    setIsSubmitting(true);
    setLocalError(null);
    try {
      await walletApi.update(activeWalletId, editWalletName);
      await loadWallets();
      setIsEditing(false);
    } catch (err: any) {
      setLocalError(err.message || "Failed to update wallet");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteWallet() {
    if (!activeWalletId) return;
    setIsSubmitting(true);
    setLocalError(null);
    try {
      await walletApi.delete(activeWalletId);
      await loadWallets();
    } catch (err: any) {
      // Show meaningful backend conflict messages as required by spec
      setLocalError(err.message || "Failed to delete wallet");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mb-6">
      <h3 className="px-3 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Wallets</h3>
      
      {walletError && (
        <div className="px-3 mb-2 text-xs text-red-500">{walletError}</div>
      )}

      <div className="space-y-1">
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            onClick={() => selectWallet(wallet.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-sm ${
              activeWalletId === wallet.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-text-muted hover:bg-background hover:text-text"
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <span className="truncate">{wallet.name}</span>
              {wallet.type === "EXTERNAL" && (
                <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-text/10 text-text-muted">Ext</span>
              )}
            </div>
            {activeWalletId === wallet.id && (
              <Check className="w-4 h-4 shrink-0" />
            )}
          </button>
        ))}

        <button
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-muted hover:bg-background hover:text-text transition-colors text-sm mt-2"
        >
          <Plus className="w-4 h-4" />
          Add Wallet
        </button>
      </div>

      {activeWallet && (
        <div className="mt-2 px-3 flex gap-2">
          <button 
            onClick={() => { setEditWalletName(activeWallet.name); setIsEditing(true); }}
            className="text-[11px] text-text-muted hover:text-primary transition-colors"
          >
            Edit Current Wallet
          </button>
        </div>
      )}

      {/* Add Wallet Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h2 className="text-xl font-bold tracking-tight mb-4 text-text">Create Wallet</h2>
            {localError && <div className="p-3 mb-4 rounded-lg bg-red-500/10 text-red-500 text-sm border border-red-500/20">{localError}</div>}
            <form onSubmit={handleCreateWallet}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Name</label>
                <input
                  type="text"
                  required
                  value={newWalletName}
                  onChange={(e) => setNewWalletName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  placeholder="e.g. Work"
                />
              </div>
              <div className="mb-6">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Type</label>
                <select
                  value={newWalletType}
                  onChange={(e) => setNewWalletType(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                >
                  <option value="INTERNAL">Internal</option>
                  <option value="EXTERNAL">External</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 rounded-lg font-medium text-sm text-text-muted hover:bg-background">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg font-medium text-sm bg-primary hover:bg-primary/90 text-white disabled:opacity-50">
                  {isSubmitting ? "Creating..." : "Create Wallet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Wallet Modal */}
      {isEditing && activeWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h2 className="text-xl font-bold tracking-tight mb-4 text-text">Edit Wallet</h2>
            <p className="text-sm text-text-muted mb-4">Type: {activeWallet.type} {activeWallet.isDefault && "(Default)"}</p>
            {localError && <div className="p-3 mb-4 rounded-lg bg-red-500/10 text-red-500 text-sm border border-red-500/20">{localError}</div>}
            
            <form onSubmit={handleEditWallet}>
              <div className="mb-6">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Name</label>
                <input
                  type="text"
                  required
                  value={editWalletName}
                  onChange={(e) => setEditWalletName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div className="flex justify-between items-center">
                <button 
                  type="button" 
                  onClick={handleDeleteWallet} 
                  disabled={isSubmitting || activeWallet.isDefault}
                  className="text-xs text-red-500 hover:text-red-400 disabled:opacity-30 transition-colors font-medium"
                >
                  Delete Wallet
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-lg font-medium text-sm text-text-muted hover:bg-background">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg font-medium text-sm bg-primary hover:bg-primary/90 text-white disabled:opacity-50">
                    {isSubmitting ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
