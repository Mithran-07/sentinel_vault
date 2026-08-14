"use client";

import { useState } from "react";
import { generatePassword, estimateStrength } from "@/lib/generator";

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

const TYPE_ICONS: Record<ItemType, string> = {
  LOGIN:          "🔑",
  SECURE_NOTE:    "📝",
  CARD:           "💳",
  IDENTITY:       "🪪",
  SSH_KEY:        "🔐",
  API_CREDENTIAL: "⚡",
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

export function ItemModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: ItemPayload;
  onSave: (data: ItemPayload) => void;
  onClose: () => void;
}) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {initial ? `Edit ${TYPE_LABELS[selectedType]}` : "New Item"}
          </h2>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground transition-colors text-lg">✕</button>
        </div>

        {/* Type selector (only shown for new items) */}
        {!initial && (
          <div className="mb-5">
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-2">Type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(TYPE_LABELS) as ItemType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                    selectedType === type
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-background text-foreground/60 hover:border-accent/40 hover:text-foreground"
                  }`}
                >
                  <span>{TYPE_ICONS[type]}</span>
                  <span className="truncate">{TYPE_LABELS[type]}</span>
                </button>
              ))}
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

        {/* Footer */}
        <div className="mt-8 flex justify-end gap-3 border-t border-border/50 pt-6">
          <button onClick={onClose} className="rounded-lg border border-border bg-transparent px-5 py-2.5 text-sm font-medium hover:bg-surfaceHover transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(data)}
            disabled={!d.name}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Save Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PasswordField({ value, show, onToggleShow, onChange }: { value: string; show: boolean; onToggleShow: () => void; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/80">Password</span>
        <button
          type="button"
          onClick={() => onChange(generatePassword({ length: 20, upper: true, lower: true, digits: true, symbols: true }))}
          className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
        >
          Generate Secure
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors"
          placeholder="••••••••••••"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="shrink-0 rounded-lg border border-border bg-background px-4 text-xs font-medium text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {value && (
        <p className={`mt-2 text-xs font-medium ${strengthColor(estimateStrength(value))}`}>
          Strength: {estimateStrength(value)}
        </p>
      )}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", mono = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground/80">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder, mono = false }: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground/80">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors resize-none ${mono ? "font-mono text-xs" : ""}`}
      />
    </div>
  );
}

function strengthColor(s: string) {
  if (s === "weak") return "text-red-500";
  if (s === "fair") return "text-yellow-500";
  return "text-accent";
}

// Re-export type helpers for vault page use
export { TYPE_LABELS, TYPE_ICONS };
