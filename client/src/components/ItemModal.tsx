"use client";

import { useState } from "react";
import { generatePassword, estimateStrength } from "@/lib/generator";
import { 
  X, 
  Lock, 
  Eye, 
  EyeOff, 
  LogIn, 
  FileText, 
  CreditCard, 
  User, 
  Key, 
  Terminal, 
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Wallet as WalletIcon
} from "lucide-react";
import { useVault } from "@/context/VaultContext";
import { Button } from "@/components/ui/Button";

// ── Discriminated union for all 6 vault item types ───────────────────────────
export type ItemType = "LOGIN" | "SECURE_NOTE" | "CARD" | "IDENTITY" | "SSH_KEY" | "API_CREDENTIAL";

export type LoginPayload    = { type: "LOGIN";          name: string; username: string; password: string; url: string; totp: string; notes: string };
export type NotePayload     = { type: "SECURE_NOTE";    name: string; content: string };
export type CardPayload     = { type: "CARD";           name: string; cardholder: string; number: string; expiry: string; cvv: string; notes: string };
export type IdentityPayload = { type: "IDENTITY";       name: string; firstName: string; lastName: string; email: string; phone: string; address: string; notes: string };
export type SshKeyPayload   = { type: "SSH_KEY";        name: string; privateKey: string; publicKey: string; passphrase: string; notes: string };
export type ApiCredPayload  = { type: "API_CREDENTIAL"; name: string; key: string; secret: string; endpoint: string; notes: string };

export type ItemPayload = LoginPayload | NotePayload | CardPayload | IdentityPayload | SshKeyPayload | ApiCredPayload;

const TYPE_LABELS: Record<ItemType, string> = {
  LOGIN:          "Login",
  SECURE_NOTE:    "Secure Note",
  CARD:           "Payment Card",
  IDENTITY:       "Identity",
  SSH_KEY:        "SSH Key",
  API_CREDENTIAL: "API Credential",
};

const TYPE_ICONS: Record<ItemType, any> = {
  LOGIN:          LogIn,
  SECURE_NOTE:    FileText,
  CARD:           CreditCard,
  IDENTITY:       User,
  SSH_KEY:        Key,
  API_CREDENTIAL: Terminal,
};

function defaultPayload(type: ItemType): ItemPayload {
  switch (type) {
    case "LOGIN":          return { type, name: "", username: "", password: "", url: "", totp: "", notes: "" };
    case "SECURE_NOTE":    return { type, name: "", content: "" };
    case "CARD":           return { type, name: "", cardholder: "", number: "", expiry: "", cvv: "", notes: "" };
    case "IDENTITY":       return { type, name: "", firstName: "", lastName: "", email: "", phone: "", address: "", notes: "" };
    case "SSH_KEY":        return { type, name: "", privateKey: "", publicKey: "", passphrase: "", notes: "" };
    case "API_CREDENTIAL": return { type, name: "", key: "", secret: "", endpoint: "", notes: "" };
  }
}

export function ItemModal({
  initial,
  onSave,
  onClose,
  initialWalletId,
}: {
  initial?: ItemPayload;
  onSave: (data: ItemPayload, walletId?: string) => void;
  onClose: () => void;
  initialWalletId?: string | null;
}) {
  const { wallets, activeWalletId } = useVault();
  const [selectedWalletId, setSelectedWalletId] = useState<string>(
    initialWalletId || activeWalletId || (wallets[0]?.id ?? "")
  );
  const [selectedType, setSelectedType] = useState<ItemType>(initial?.type ?? "LOGIN");
  const [data, setData] = useState<ItemPayload>(initial ?? defaultPayload("LOGIN"));
  const [showPassword, setShowPassword] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function handleTypeChange(type: ItemType) {
    setSelectedType(type);
    const existing = data as Record<string, unknown>;
    const next = { ...defaultPayload(type), name: existing.name ?? "" } as ItemPayload;
    setData(next);
  }

  const d = data as Record<string, unknown>;
  const set = (field: string, value: string) => setData({ ...data, [field]: value } as ItemPayload);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.name || !selectedWalletId) return;
    setIsSaving(true);
    try {
      await onSave(data, selectedWalletId);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-md p-4 animate-fade-in"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-surface border border-line rounded-2xl shadow-pop w-full max-w-[620px] overflow-hidden z-10 flex flex-col max-h-[92vh] animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-line flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface border border-accent/30 text-accent flex items-center justify-center">
              <Lock size={16} />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-fg tracking-tight">
                {initial ? `Edit ${TYPE_LABELS[selectedType]}` : "New Credential"}
              </h2>
              <p className="text-[11px] font-mono text-accent">
                Client-side AES-256-GCM encryption
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-2 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleFormSubmit} className="p-6 flex flex-col gap-5 overflow-y-auto flex-1">
          {/* Destination Wallet */}
          <div className="flex flex-col gap-1.5">
            <label className="label flex items-center gap-1.5">
              <WalletIcon size={14} className="text-accent" />
              <span>Wallet Destination</span>
            </label>
            <select
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="field appearance-none cursor-pointer"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} {w.type === "EXTERNAL" ? "— (External)" : "— (Internal)"}
                </option>
              ))}
            </select>
          </div>

          {/* Type Selector (New items only) */}
          {!initial && (
            <div className="flex flex-col gap-1.5">
              <label className="label">Item Category</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1 bg-surface-2/60 rounded-xl border border-line">
                {(Object.keys(TYPE_LABELS) as ItemType[]).map((type) => {
                  const Icon = TYPE_ICONS[type];
                  const isSelected = selectedType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs transition-all ${
                        isSelected
                          ? "bg-surface text-accent font-semibold border border-accent/40 shadow-sm"
                          : "text-fg-subtle hover:text-fg hover:bg-surface/50"
                      }`}
                    >
                      <Icon size={16} className="mb-1" />
                      <span className="truncate text-[10px]">{TYPE_LABELS[type]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Item Name */}
          <div className="space-y-4">
            <div>
              <label className="label">Display Name *</label>
              <input
                required
                type="text"
                value={String(d.name ?? "")}
                onChange={(e) => set("name", e.target.value)}
                placeholder={`e.g. ${selectedType === "LOGIN" ? "GitHub Account" : selectedType === "CARD" ? "Primary Visa" : "Production " + TYPE_LABELS[selectedType]}`}
                className="field"
              />
            </div>

            {/* ── LOGIN ── */}
            {selectedType === "LOGIN" && (
              <>
                <div>
                  <label className="label">Username / Email</label>
                  <input
                    type="text"
                    value={String(d.username ?? "")}
                    onChange={(e) => set("username", e.target.value)}
                    placeholder="name@example.com"
                    className="field"
                  />
                </div>
                <PasswordField
                  value={String(d.password ?? "")}
                  show={showPassword}
                  onToggleShow={() => setShowPassword((s) => !s)}
                  onChange={(v) => set("password", v)}
                />
                <div>
                  <label className="label">Website URL</label>
                  <input
                    type="url"
                    value={String(d.url ?? "")}
                    onChange={(e) => set("url", e.target.value)}
                    placeholder="https://example.com"
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">TOTP Seed / Secret (Optional)</label>
                  <input
                    type="text"
                    value={String(d.totp ?? "")}
                    onChange={(e) => set("totp", e.target.value)}
                    placeholder="Base32 authenticator secret"
                    className="field font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    rows={3}
                    value={String(d.notes ?? "")}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Additional encrypted notes..."
                    className="field h-auto py-2 resize-y"
                  />
                </div>
              </>
            )}

            {/* ── SECURE NOTE ── */}
            {selectedType === "SECURE_NOTE" && (
              <div>
                <label className="label">Encrypted Note Content *</label>
                <textarea
                  rows={8}
                  value={String(d.content ?? "")}
                  onChange={(e) => set("content", e.target.value)}
                  placeholder="Type sensitive notes, recovery phrases, or private records..."
                  className="field h-auto py-2.5 resize-y font-mono text-xs leading-relaxed"
                />
              </div>
            )}

            {/* ── CARD ── */}
            {selectedType === "CARD" && (
              <>
                <div>
                  <label className="label">Cardholder Name</label>
                  <input
                    type="text"
                    value={String(d.cardholder ?? "")}
                    onChange={(e) => set("cardholder", e.target.value)}
                    placeholder="Jane Doe"
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">Card Number</label>
                  <input
                    type="text"
                    value={String(d.number ?? "")}
                    onChange={(e) => set("number", e.target.value)}
                    placeholder="4532 •••• •••• 8892"
                    className="field font-mono text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Expiry (MM/YY)</label>
                    <input
                      type="text"
                      value={String(d.expiry ?? "")}
                      onChange={(e) => set("expiry", e.target.value)}
                      placeholder="08/28"
                      className="field font-mono text-xs"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="label mb-0">CVV / CVC</label>
                      <button
                        type="button"
                        onClick={() => setShowSensitive((s) => !s)}
                        className="text-[10px] text-accent hover:underline font-mono"
                      >
                        {showSensitive ? "Hide" : "Reveal"}
                      </button>
                    </div>
                    <input
                      type={showSensitive ? "text" : "password"}
                      maxLength={4}
                      value={String(d.cvv ?? "")}
                      onChange={(e) => set("cvv", e.target.value)}
                      placeholder="•••"
                      className="field font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    rows={2}
                    value={String(d.notes ?? "")}
                    onChange={(e) => set("notes", e.target.value)}
                    className="field h-auto py-2 resize-y"
                  />
                </div>
              </>
            )}

            {/* ── IDENTITY ── */}
            {selectedType === "IDENTITY" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">First Name</label>
                    <input
                      type="text"
                      value={String(d.firstName ?? "")}
                      onChange={(e) => set("firstName", e.target.value)}
                      placeholder="Jane"
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="label">Last Name</label>
                    <input
                      type="text"
                      value={String(d.lastName ?? "")}
                      onChange={(e) => set("lastName", e.target.value)}
                      placeholder="Doe"
                      className="field"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    value={String(d.email ?? "")}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="jane@example.com"
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">Phone Number</label>
                  <input
                    type="tel"
                    value={String(d.phone ?? "")}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="+1 555 0192"
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">Address</label>
                  <textarea
                    rows={2}
                    value={String(d.address ?? "")}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Street, City, Country"
                    className="field h-auto py-2 resize-y"
                  />
                </div>
              </>
            )}

            {/* ── SSH KEY ── */}
            {selectedType === "SSH_KEY" && (
              <>
                <div>
                  <label className="label">Private Key *</label>
                  <textarea
                    rows={6}
                    value={String(d.privateKey ?? "")}
                    onChange={(e) => set("privateKey", e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    className="field h-auto py-2 font-mono text-xs leading-relaxed"
                  />
                </div>
                <div>
                  <label className="label">Public Key</label>
                  <textarea
                    rows={2}
                    value={String(d.publicKey ?? "")}
                    onChange={(e) => set("publicKey", e.target.value)}
                    placeholder="ssh-ed25519 AAAA..."
                    className="field h-auto py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">Passphrase (optional)</label>
                  <input
                    type="password"
                    value={String(d.passphrase ?? "")}
                    onChange={(e) => set("passphrase", e.target.value)}
                    className="field font-mono text-xs"
                  />
                </div>
              </>
            )}

            {/* ── API CREDENTIAL ── */}
            {selectedType === "API_CREDENTIAL" && (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="label mb-0">API Key / Token *</label>
                    <button
                      type="button"
                      onClick={() => setShowSensitive((s) => !s)}
                      className="text-[10px] text-accent hover:underline font-mono"
                    >
                      {showSensitive ? "Hide" : "Reveal"}
                    </button>
                  </div>
                  <input
                    type={showSensitive ? "text" : "password"}
                    value={String(d.key ?? "")}
                    onChange={(e) => set("key", e.target.value)}
                    placeholder="sk_live_..."
                    className="field font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">API Secret (Optional)</label>
                  <input
                    type="password"
                    value={String(d.secret ?? "")}
                    onChange={(e) => set("secret", e.target.value)}
                    placeholder="Secret token or signature"
                    className="field font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">Endpoint / Base URL (Optional)</label>
                  <input
                    type="url"
                    value={String(d.endpoint ?? "")}
                    onChange={(e) => set("endpoint", e.target.value)}
                    placeholder="https://api.service.com/v1"
                    className="field"
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="mt-4 pt-4 border-t border-line flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle font-mono">
              <ShieldCheck size={14} className="text-lime" />
              <span>Encrypted in memory before send</span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSaving} disabled={!d.name || !selectedWalletId}>
                {initial ? "Save Changes" : "Save Credential"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-component for Password Generation & Strength ────────────────────────
function PasswordField({
  value,
  show,
  onToggleShow,
  onChange,
}: {
  value: string;
  show: boolean;
  onToggleShow: () => void;
  onChange: (v: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    const nextPass = generatePassword({
      length: 22,
      upper: true,
      lower: true,
      digits: true,
      symbols: true,
    });
    onChange(nextPass);
  }

  function handleCopy() {
    if (value) {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  const strength = estimateStrength(value);
  const strengthStyles = {
    weak: { bar: "w-1/3 bg-danger", label: "Weak — easily guessable", color: "text-danger" },
    fair: { bar: "w-2/3 bg-warning", label: "Fair — acceptable", color: "text-warning" },
    strong: { bar: "w-full bg-lime", label: "Strong — cryptographic grade", color: "text-lime" },
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Password *</label>
        <button
          type="button"
          onClick={handleGenerate}
          className="inline-flex items-center gap-1 text-[11px] font-mono text-accent hover:text-accent-strong transition-colors"
        >
          <RefreshCw size={12} />
          <span>Generate Strong (22 chars)</span>
        </button>
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••••••••••"
          className="field pr-20 font-mono text-xs"
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 text-fg-subtle hover:text-fg rounded transition-colors"
              title="Copy password"
            >
              {copied ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleShow}
            className="p-1 text-fg-subtle hover:text-fg rounded transition-colors"
            title={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {value && (
        <div className="pt-1 space-y-1">
          <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden border border-line">
            <div className={`h-full transition-all duration-300 ${strengthStyles[strength].bar}`} />
          </div>
          <div className="flex justify-between items-center text-[10px] font-mono">
            <span className={strengthStyles[strength].color}>
              {strengthStyles[strength].label}
            </span>
            <span className="text-fg-subtle">{value.length} characters</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { TYPE_LABELS, TYPE_ICONS };
