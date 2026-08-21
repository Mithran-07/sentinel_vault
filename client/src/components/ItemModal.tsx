"use client";

import { useState } from "react";
import { generatePassword, estimateStrength } from "@/lib/generator";
import { X, Lock, Eye, EyeOff, LogIn, FileText, CreditCard, User, Key, Terminal } from "lucide-react";

// ── Discriminated union for all 6 vault item types ───────────────────────────
// All fields are encrypted as a single JSON blob — the server sees only
// the `type` enum (for filtering) and the opaque ciphertext.

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
  CARD:           "Card",
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

// ── Component ────────────────────────────────────────────────────────────────

import { useVault } from "@/context/VaultContext";

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
    initialWalletId || activeWalletId || ""
  );
  const [selectedType, setSelectedType] = useState<ItemType>(initial?.type ?? "LOGIN");
  const [data, setData] = useState<ItemPayload>(initial ?? defaultPayload("LOGIN"));
  const [showPassword, setShowPassword] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);

  function handleTypeChange(type: ItemType) {
    setSelectedType(type);
    // Preserve name if already filled, otherwise reset to defaults for new type.
    const existing = data as Record<string, unknown>;
    const next = { ...defaultPayload(type), name: existing.name ?? "" } as ItemPayload;
    setData(next);
  }

  const d = data as Record<string, unknown>;
  const set = (field: string, value: string) => setData({ ...data, [field]: value } as ItemPayload);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-surface w-full max-w-[600px] rounded-xl border border-border shadow-[0px_4px_12px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-surface sticky top-0 z-10">
          <h2 className="font-headline-md text-headline-md text-text">
            {initial ? `Edit ${TYPE_LABELS[selectedType]}` : "New Credential"}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          {/* Wallet Selector */}
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md text-text-muted">Wallet Destination</label>
            <select
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg font-body-sm text-body-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all appearance-none"
            >
              {wallets.map(w => (
                <option key={w.id} value={w.id}>{w.name} {w.type === "EXTERNAL" ? "(External)" : ""}</option>
              ))}
            </select>
          </div>

          {/* Type selector (only shown for new items) */}
          {!initial && (
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-text-muted">Item Type</label>
              <div className="flex flex-wrap p-1 bg-background rounded-lg gap-1 border border-border">
                {(Object.keys(TYPE_LABELS) as ItemType[]).map((type) => {
                  const Icon = TYPE_ICONS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`flex-1 min-w-[100px] py-2 px-2 rounded-md font-label-md text-label-md transition-colors flex items-center justify-center gap-2 ${
                        selectedType === type
                          ? "bg-surface text-primary shadow-sm border border-border"
                          : "text-text-muted hover:bg-surface"
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                      <span className="truncate">{TYPE_LABELS[type]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        {/* Common: Name */}
        <div className="space-y-4">
          <Input label="Name" value={String(d.name ?? "")} onChange={(v) => set("name", v)} placeholder={`e.g. ${selectedType === "LOGIN" ? "GitHub" : selectedType === "CARD" ? "Visa Debit" : "My " + TYPE_LABELS[selectedType]}`} />

          {/* ── LOGIN fields ── */}
          {selectedType === "LOGIN" && <>
            <Input label="Username" value={String(d.username ?? "")} onChange={(v) => set("username", v)} placeholder="name@example.com" />
            <PasswordField
              value={String(d.password ?? "")}
              show={showPassword}
              onToggleShow={() => setShowPassword(s => !s)}
              onChange={(v) => set("password", v)}
            />
            <Input label="URL" value={String(d.url ?? "")} onChange={(v) => set("url", v)} placeholder="https://example.com" />
            <Input label="TOTP Secret (optional)" value={String(d.totp ?? "")} onChange={(v) => set("totp", v)} placeholder="Base32 secret key" />
            <TextArea label="Notes" value={String(d.notes ?? "")} onChange={(v) => set("notes", v)} />
          </>}

          {/* ── SECURE_NOTE fields ── */}
          {selectedType === "SECURE_NOTE" && <>
            <TextArea label="Content" value={String(d.content ?? "")} onChange={(v) => set("content", v)} rows={8} placeholder="Your private note..." />
          </>}

          {/* ── CARD fields ── */}
          {selectedType === "CARD" && <>
            <Input label="Cardholder Name" value={String(d.cardholder ?? "")} onChange={(v) => set("cardholder", v)} placeholder="Jane Smith" />
            <Input label="Card Number" value={String(d.number ?? "")} onChange={(v) => set("number", v)} placeholder="4242 4242 4242 4242" mono />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Expiry" value={String(d.expiry ?? "")} onChange={(v) => set("expiry", v)} placeholder="MM/YY" />
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground/80">CVV</label>
                  <button type="button" onClick={() => setShowSensitive(s => !s)} className="text-xs text-foreground/50 hover:text-foreground">{showSensitive ? "Hide" : "Show"}</button>
                </div>
                <input
                  type={showSensitive ? "text" : "password"}
                  value={String(d.cvv ?? "")}
                  onChange={(e) => set("cvv", e.target.value)}
                  placeholder="•••"
                  maxLength={4}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors"
                />
              </div>
            </div>
            <TextArea label="Notes" value={String(d.notes ?? "")} onChange={(v) => set("notes", v)} />
          </>}

          {/* ── IDENTITY fields ── */}
          {selectedType === "IDENTITY" && <>
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name" value={String(d.firstName ?? "")} onChange={(v) => set("firstName", v)} placeholder="Jane" />
              <Input label="Last Name" value={String(d.lastName ?? "")} onChange={(v) => set("lastName", v)} placeholder="Smith" />
            </div>
            <Input label="Email" value={String(d.email ?? "")} onChange={(v) => set("email", v)} placeholder="jane@example.com" />
            <Input label="Phone" value={String(d.phone ?? "")} onChange={(v) => set("phone", v)} placeholder="+91 98765 43210" />
            <TextArea label="Address" value={String(d.address ?? "")} onChange={(v) => set("address", v)} rows={3} placeholder="123 Main St, City, Country" />
            <TextArea label="Notes" value={String(d.notes ?? "")} onChange={(v) => set("notes", v)} />
          </>}

          {/* ── SSH_KEY fields ── */}
          {selectedType === "SSH_KEY" && <>
            <TextArea label="Private Key" value={String(d.privateKey ?? "")} onChange={(v) => set("privateKey", v)} rows={6} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" mono />
            <TextArea label="Public Key" value={String(d.publicKey ?? "")} onChange={(v) => set("publicKey", v)} rows={3} placeholder="ssh-ed25519 AAAA..." mono />
            <Input label="Passphrase (if any)" value={String(d.passphrase ?? "")} onChange={(v) => set("passphrase", v)} placeholder="Key passphrase" type="password" />
            <TextArea label="Notes" value={String(d.notes ?? "")} onChange={(v) => set("notes", v)} />
          </>}

          {/* ── API_CREDENTIAL fields ── */}
          {selectedType === "API_CREDENTIAL" && <>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-foreground/80">API Key</label>
                <button type="button" onClick={() => setShowSensitive(s => !s)} className="text-xs text-foreground/50 hover:text-foreground">{showSensitive ? "Hide" : "Show"}</button>
              </div>
              <input
                type={showSensitive ? "text" : "password"}
                value={String(d.key ?? "")}
                onChange={(e) => set("key", e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors"
              />
            </div>
            <Input label="API Secret (optional)" value={String(d.secret ?? "")} onChange={(v) => set("secret", v)} placeholder="Secret key or token" type="password" />
            <Input label="Endpoint / Base URL (optional)" value={String(d.endpoint ?? "")} onChange={(v) => set("endpoint", v)} placeholder="https://api.example.com" />
            <TextArea label="Notes" value={String(d.notes ?? "")} onChange={(v) => set("notes", v)} />
          </>}
        </div>

        </div>
        
        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface flex justify-between items-center sticky bottom-0 z-10">
          <div className="flex items-center gap-2 text-text-muted">
            <Lock className="w-4 h-4" />
            <span className="font-body-sm text-body-sm font-semibold hidden sm:inline">Encrypted in your browser</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 bg-background border border-border text-text-muted rounded-lg font-label-md text-label-md hover:bg-border/50 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => onSave(data, selectedWalletId)}
              disabled={!d.name || !selectedWalletId}
              className="px-4 py-2 bg-primary text-white rounded-lg font-label-md text-label-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Credential
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PasswordField({ value, show, onToggleShow, onChange }: { value: string; show: boolean; onToggleShow: () => void; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="mb-0.5 flex items-center justify-between">
        <label className="font-label-md text-label-md text-text-muted">Password</label>
        <button
          type="button"
          onClick={() => onChange(generatePassword({ length: 20, upper: true, lower: true, digits: true, symbols: true }))}
          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Generate Secure
        </button>
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-3 pr-10 py-2 bg-background border border-border rounded-lg font-code-mono text-code-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-text"
          placeholder="••••••••••••"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text flex items-center justify-center"
        >
          {show ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
        </button>
      </div>
      {value && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-background border border-border">
            <div className={`h-full transition-all duration-300 ${estimateStrength(value) === 'weak' ? 'bg-danger w-1/3' : estimateStrength(value) === 'fair' ? 'bg-warning w-2/3' : 'bg-success w-full'}`}></div>
          </div>
          <p className={`text-xs font-medium ${strengthColor(estimateStrength(value))}`}>
            Strength: {estimateStrength(value)}
          </p>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", mono = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-label-md text-label-md text-text-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all ${mono ? "font-code-mono text-code-mono" : "font-body-sm text-body-sm"}`}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder, mono = false }: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-label-md text-label-md text-text-muted">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all resize-y ${mono ? "font-code-mono text-code-mono text-xs" : "font-body-sm text-body-sm"}`}
      />
    </div>
  );
}

function strengthColor(s: string) {
  if (s === "weak") return "text-danger";
  if (s === "fair") return "text-warning";
  return "text-success";
}

// Re-export type helpers for vault page use
export { TYPE_LABELS, TYPE_ICONS };
