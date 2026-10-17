"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/context/VaultContext";
import { encryptItem, decryptItem } from "@/lib/crypto";
import { api } from "@/lib/api";
import { ItemModal, ItemPayload, TYPE_LABELS, ItemType } from "@/components/ItemModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { ShareModal } from "@/components/ShareModal";
import { AppShell } from "@/components/AppShell";
import { 
  Search, 
  Plus, 
  Inbox, 
  Copy, 
  Check, 
  MoreVertical, 
  Code, 
  Cloud, 
  Trash2, 
  Share2, 
  Edit3, 
  Key, 
  CreditCard, 
  FileText, 
  User, 
  Terminal, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  ExternalLink,
  Clock,
  ArrowUpDown,
  Lock,
  Layers,
  Sparkles,
  X
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

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

const TYPE_ICONS: Record<string, any> = {
  LOGIN: Key,
  SECURE_NOTE: FileText,
  CARD: CreditCard,
  IDENTITY: User,
  SSH_KEY: Code,
  API_CREDENTIAL: Terminal,
};

export default function VaultPage() {
  const router = useRouter();
  const { toast } = { toast: useToast() };
  const { vaultKey, activeWalletId, wallets } = useVault();
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DecryptedItem | null>(null);
  const [sharing, setSharing] = useState<DecryptedItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<DecryptedItem | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"updated" | "name">("updated");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showDetailPassword, setShowDetailPassword] = useState(false);
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
      if (!res.ok) throw new Error("Failed to load vault items");
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
      if (selectedItem) {
        const refreshed = decrypted.find((d) => d.id === selectedItem.id);
        if (refreshed) setSelectedItem(refreshed);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to decrypt vault contents");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(data: ItemPayload, targetWalletId?: string) {
    if (!vaultKey || !activeWalletId) return;
    const blob = await encryptItem(data, vaultKey);
    const destWallet = targetWalletId || activeWalletId;

    if (editing) {
      const res = await api.put(`/vault/items/${editing.id}`, {
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        type: data.type,
        walletId: destWallet,
      });
      if (!res.ok) throw new Error("Failed to update item");
      toast.success("Credential updated securely");
    } else {
      const res = await api.post("/vault/items", {
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        type: data.type,
        walletId: destWallet,
      });
      if (!res.ok) throw new Error("Failed to create item");
      toast.success("Credential encrypted & saved");
    }
    setModalOpen(false);
    setEditing(null);
    await loadItems();
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      const res = await api.del(`/vault/items/${deleteConfirmId}`);
      if (!res.ok) throw new Error("Failed to delete item");
      toast.success("Moved item to trash");
      if (selectedItem?.id === deleteConfirmId) {
        setSelectedItem(null);
      }
      await loadItems();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete item");
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  }

  function handleCopy(id: string, text: string, fieldName: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setCopiedField(fieldName);
    toast.success(`Copied ${fieldName} to clipboard`);
    setTimeout(() => {
      setCopiedId(null);
      setCopiedField(null);
    }, 1800);
  }

  // Filter & Sort
  const filtered = useMemo(() => {
    return items
      .filter((i) => {
        const matchesQuery =
          i.data.name.toLowerCase().includes(query.toLowerCase()) ||
          ("username" in i.data && i.data.username.toLowerCase().includes(query.toLowerCase())) ||
          ("url" in i.data && i.data.url.toLowerCase().includes(query.toLowerCase()));
        const matchesCategory = categoryFilter === "ALL" || i.data.type === categoryFilter;
        return matchesQuery && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.data.name.localeCompare(b.data.name);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [items, query, categoryFilter, sortBy]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) {
      window.addEventListener("click", handleClick);
    }
    return () => window.removeEventListener("click", handleClick);
  }, [menuOpenId]);

  const activeWallet = wallets.find((w) => w.id === activeWalletId);

  // Search items format for CommandPalette
  const searchItems = useMemo(() => {
    return items.map((i) => ({
      id: i.id,
      name: i.data.name,
      username: "username" in i.data ? i.data.username : undefined,
      type: TYPE_LABELS[i.data.type as ItemType],
    }));
  }, [items]);

  const categories = [
    { id: "ALL", label: "All Items", count: items.length },
    { id: "LOGIN", label: "Logins", count: items.filter((i) => i.data.type === "LOGIN").length },
    { id: "SECURE_NOTE", label: "Secure Notes", count: items.filter((i) => i.data.type === "SECURE_NOTE").length },
    { id: "CARD", label: "Cards", count: items.filter((i) => i.data.type === "CARD").length },
    { id: "SSH_KEY", label: "SSH Keys", count: items.filter((i) => i.data.type === "SSH_KEY").length },
    { id: "API_CREDENTIAL", label: "API Keys", count: items.filter((i) => i.data.type === "API_CREDENTIAL").length },
  ];

  const headerActions = (
    <Button
      onClick={() => {
        setEditing(null);
        setModalOpen(true);
      }}
      variant="primary"
      size="sm"
      className="shrink-0"
    >
      <Plus size={16} className="mr-1" />
      <span>New Credential</span>
    </Button>
  );

  return (
    <AppShell
      pageTitle="Vault Credentials"
      headerActions={headerActions}
      onNewCredential={() => {
        setEditing(null);
        setModalOpen(true);
      }}
      vaultItemsForSearch={searchItems}
      onSelectSearchItem={(id) => {
        const item = items.find((i) => i.id === id);
        if (item) setSelectedItem(item);
      }}
    >
      {/* ── WORKSPACE TOOLBAR: CATEGORIES & QUICK FILTER ───────────────────── */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-4">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {categories.map((cat) => {
            const isSelected = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-surface-2 text-fg border border-line-strong font-semibold shadow-xs"
                    : "text-fg-muted hover:text-fg hover:bg-surface-2/60 border border-transparent"
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? "bg-accent/15 text-accent" : "bg-surface-3 text-fg-subtle"
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter credentials..."
              className="field pl-8 pr-7 text-xs h-8 bg-surface-2/70"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg text-xs"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="field h-8 py-0.5 px-2 text-xs w-auto bg-surface-2/70 cursor-pointer text-fg-muted"
          >
            <option value="updated">Recently Modified</option>
            <option value="name">Alphabetical (A-Z)</option>
          </select>
        </div>
      </div>

      {/* ── CREDENTIAL CONTENT GRID / TABLE ───────────────────────────────── */}
      {loading ? (
        <div className="panel p-6 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-line">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-12 text-center max-w-lg mx-auto flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-accent/25 text-accent flex items-center justify-center mb-4 shadow-[0_0_20px_-5px_rgb(var(--c-accent)/0.3)]">
            <Inbox size={26} />
          </div>
          <h3 className="font-display text-base font-bold text-fg mb-1.5">
            {query || categoryFilter !== "ALL" ? "No matching credentials" : "Vault is empty"}
          </h3>
          <p className="text-xs text-fg-muted mb-5 max-w-sm leading-relaxed">
            {query || categoryFilter !== "ALL"
              ? "No items match your active search and category filter. Try clearing your filters."
              : "Store your passwords, secure notes, card credentials, or API keys. Everything is encrypted locally before being stored."}
          </p>
          {!query && categoryFilter === "ALL" ? (
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              variant="primary"
              size="sm"
            >
              <Plus size={16} className="mr-1.5" />
              Create First Credential
            </Button>
          ) : (
            <Button
              onClick={() => {
                setQuery("");
                setCategoryFilter("ALL");
              }}
              variant="ghost"
              size="sm"
            >
              Clear Search & Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-2/40 text-[11px] font-mono uppercase tracking-wider text-fg-subtle">
                  <th className="py-3 px-4 sm:px-6">Credential</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Account / Username</th>
                  <th className="py-3 px-4 hidden md:table-cell">Category</th>
                  <th className="py-3 px-4 hidden lg:table-cell">Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs">
                {filtered.map((item) => {
                  const Icon = TYPE_ICONS[item.data.type] || Lock;
                  const isLogin = item.data.type === "LOGIN";
                  const isCard = item.data.type === "CARD";
                  const usernameText =
                    "username" in item.data
                      ? item.data.username
                      : "cardholder" in item.data
                      ? item.data.cardholder
                      : "email" in item.data
                      ? item.data.email
                      : "—";

                  const updatedDate = new Date(item.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="hover:bg-surface-2/50 transition-colors group cursor-pointer"
                    >
                      {/* Name & Icon */}
                      <td className="py-3 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center shrink-0 text-accent group-hover:border-accent/40 transition-colors">
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-fg truncate text-xs flex items-center gap-1.5">
                              <span>{item.data.name}</span>
                              {"url" in item.data && item.data.url && (
                                <span className="text-[10px] font-mono text-fg-subtle hidden xl:inline truncate max-w-[120px]">
                                  ({item.data.url.replace(/^https?:\/\//, "")})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-fg-subtle sm:hidden truncate max-w-[180px] font-mono">
                              {usernameText}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Username */}
                      <td className="py-3 px-4 hidden sm:table-cell">
                        <span className="font-mono text-fg-muted truncate max-w-[180px] block">
                          {usernameText}
                        </span>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-4 hidden md:table-cell">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-2 text-fg-subtle border border-line">
                          {TYPE_LABELS[item.data.type as ItemType]}
                        </span>
                      </td>

                      {/* Updated Date */}
                      <td className="py-3 px-4 hidden lg:table-cell text-fg-subtle font-mono text-[11px]">
                        {updatedDate}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* Copy Password Button (Logins) */}
                          {isLogin && "password" in item.data && item.data.password && (
                            <button
                              onClick={() => handleCopy(item.id, (item.data as any).password, "Password")}
                              className="p-1.5 text-fg-subtle hover:text-accent hover:bg-surface-3 rounded-lg transition-colors"
                              title="Copy Password"
                            >
                              {copiedId === item.id && copiedField === "Password" ? (
                                <Check size={15} className="text-lime" />
                              ) : (
                                <Copy size={15} />
                              )}
                            </button>
                          )}

                          {/* Quick Share Button */}
                          <button
                            onClick={() => setSharing(item)}
                            className="p-1.5 text-fg-subtle hover:text-uv hover:bg-surface-3 rounded-lg transition-colors"
                            title="Share Credential"
                          >
                            <Share2 size={15} />
                          </button>

                          {/* Quick Edit Button */}
                          <button
                            onClick={() => {
                              setEditing(item);
                              setModalOpen(true);
                            }}
                            className="p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-3 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit3 size={15} />
                          </button>

                          {/* Quick Delete */}
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="p-1.5 text-fg-subtle hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CREDENTIAL DETAIL SIDE PANEL / MODAL ──────────────────────────── */}
      {selectedItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end bg-canvas/75 backdrop-blur-sm animate-fade-in"
        >
          <div className="fixed inset-0" onClick={() => setSelectedItem(null)} />
          <div
            className="relative w-full max-w-lg h-full sm:h-auto sm:max-h-[92vh] bg-surface border-l sm:border sm:rounded-2xl border-line shadow-pop p-6 flex flex-col z-10 overflow-y-auto animate-slide-in-right sm:m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Detail Header */}
            <div className="flex items-start justify-between pb-4 border-b border-line">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-2 border border-accent/30 text-accent flex items-center justify-center shrink-0">
                  {(() => {
                    const Icon = TYPE_ICONS[selectedItem.data.type] || Lock;
                    return <Icon size={20} />;
                  })()}
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-fg leading-tight">
                    {selectedItem.data.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-2 text-fg-subtle uppercase border border-line">
                      {TYPE_LABELS[selectedItem.data.type as ItemType]}
                    </span>
                    <span className="text-[11px] text-fg-subtle font-mono">
                      Decrypted locally
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1.5 text-fg-subtle hover:text-fg rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Field list */}
            <div className="py-5 space-y-4 flex-1">
              {/* Login fields */}
              {"username" in selectedItem.data && selectedItem.data.username && (
                <div className="p-3 rounded-xl bg-surface-2/40 border border-line">
                  <div className="flex justify-between items-center text-[11px] text-fg-subtle font-mono mb-1">
                    <span>USERNAME / EMAIL</span>
                    <button
                      onClick={() =>
                        handleCopy(selectedItem.id, (selectedItem.data as any).username, "Username")
                      }
                      className="text-accent hover:underline flex items-center gap-1"
                    >
                      <Copy size={11} /> Copy
                    </button>
                  </div>
                  <div className="text-xs font-mono text-fg select-all">
                    {selectedItem.data.username}
                  </div>
                </div>
              )}

              {"password" in selectedItem.data && selectedItem.data.password && (
                <div className="p-3 rounded-xl bg-surface-2/40 border border-line">
                  <div className="flex justify-between items-center text-[11px] text-fg-subtle font-mono mb-1">
                    <span>MASTER SECURE PASSWORD</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowDetailPassword((s) => !s)}
                        className="text-fg-subtle hover:text-fg flex items-center gap-1 text-[11px]"
                      >
                        {showDetailPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showDetailPassword ? "Hide" : "Reveal"}
                      </button>
                      <button
                        onClick={() =>
                          handleCopy(selectedItem.id, (selectedItem.data as any).password, "Password")
                        }
                        className="text-accent hover:underline flex items-center gap-1"
                      >
                        <Copy size={11} /> Copy
                      </button>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-fg tracking-wider select-all">
                    {showDetailPassword ? selectedItem.data.password : "••••••••••••••••••••"}
                  </div>
                </div>
              )}

              {"url" in selectedItem.data && selectedItem.data.url && (
                <div className="p-3 rounded-xl bg-surface-2/40 border border-line">
                  <div className="text-[11px] text-fg-subtle font-mono mb-1">TARGET URL</div>
                  <a
                    href={selectedItem.data.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-accent hover:underline flex items-center gap-1 truncate"
                  >
                    <span className="truncate">{selectedItem.data.url}</span>
                    <ExternalLink size={12} className="shrink-0" />
                  </a>
                </div>
              )}

              {"totp" in selectedItem.data && selectedItem.data.totp && (
                <div className="p-3 rounded-xl bg-surface-2/40 border border-line">
                  <div className="text-[11px] text-fg-subtle font-mono mb-1">2FA / TOTP SEED</div>
                  <div className="text-xs font-mono text-fg-muted truncate">
                    {selectedItem.data.totp}
                  </div>
                </div>
              )}

              {"content" in selectedItem.data && (
                <div className="p-3 rounded-xl bg-surface-2/40 border border-line">
                  <div className="text-[11px] text-fg-subtle font-mono mb-1">NOTE CONTENT</div>
                  <pre className="text-xs font-mono text-fg whitespace-pre-wrap leading-relaxed select-all">
                    {selectedItem.data.content}
                  </pre>
                </div>
              )}

              {"notes" in selectedItem.data && selectedItem.data.notes && (
                <div className="p-3 rounded-xl bg-surface-2/40 border border-line">
                  <div className="text-[11px] text-fg-subtle font-mono mb-1">ADDITIONAL NOTES</div>
                  <p className="text-xs text-fg-muted whitespace-pre-wrap">
                    {selectedItem.data.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Detail Actions */}
            <div className="pt-4 border-t border-line flex items-center justify-between">
              <Button
                variant="dangerGhost"
                size="sm"
                onClick={() => setDeleteConfirmId(selectedItem.id)}
              >
                <Trash2 size={14} className="mr-1" />
                Trash
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSharing(selectedItem);
                  }}
                >
                  <Share2 size={14} className="mr-1" />
                  Share Link
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditing(selectedItem);
                    setModalOpen(true);
                  }}
                >
                  <Edit3 size={14} className="mr-1" />
                  Edit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ────────────────────────────────────────────────────────── */}
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative bg-surface border border-line rounded-2xl shadow-pop w-full max-w-sm p-6 text-center animate-pop-in">
            <div className="w-12 h-12 rounded-xl bg-danger/15 text-danger border border-danger/35 flex items-center justify-center mx-auto mb-3">
              <Trash2 size={24} />
            </div>
            <h3 className="font-display text-base font-bold text-fg mb-1">
              Move to Trash?
            </h3>
            <p className="text-xs text-fg-muted mb-5 leading-relaxed">
              This credential will be moved to the Trash. You can restore it anytime or delete it permanently.
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
                Move to Trash
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
