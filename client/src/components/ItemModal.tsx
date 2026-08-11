"use client";

import { useState } from "react";
import { generatePassword, estimateStrength } from "@/lib/generator";

export interface ItemPayload {
  name: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

export function ItemModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: ItemPayload;
  onSave: (data: ItemPayload) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<ItemPayload>(
    initial ?? { name: "", username: "", password: "", url: "", notes: "" }
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 transition-all">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl">
        <h2 className="mb-6 text-xl font-bold tracking-tight text-foreground">{initial ? "Edit Item" : "New Login"}</h2>
        
        <div className="space-y-4">
          <Input label="Name" value={data.name} onChange={(v) => setData({ ...data, name: v })} placeholder="e.g. GitHub" />
          <Input label="Username" value={data.username} onChange={(v) => setData({ ...data, username: v })} placeholder="name@example.com" />
          
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/80">Password</span>
              <button
                type="button"
                onClick={() => setData({ ...data, password: generatePassword({ length: 20, upper: true, lower: true, digits: true, symbols: true }) })}
                className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Generate Secure
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type={showPassword ? "text" : "password"}
                value={data.password}
                onChange={(e) => setData({ ...data, password: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-foreground/40 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="shrink-0 rounded-lg border border-border bg-background px-4 text-xs font-medium text-foreground/70 hover:bg-surfaceHover hover:text-foreground transition-colors"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {data.password && (
              <p className={`mt-2 text-xs font-medium ${strengthColor(estimateStrength(data.password))}`}>
                Strength: {estimateStrength(data.password)}
              </p>
            )}
          </div>
          
          <Input label="URL" value={data.url} onChange={(v) => setData({ ...data, url: v })} placeholder="https://example.com" />
          
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground/80">Notes</label>
            <textarea
              value={data.notes}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none"
              placeholder="Any additional notes..."
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-border/50 pt-6">
          <button onClick={onClose} className="rounded-lg border border-border bg-transparent px-5 py-2.5 text-sm font-medium hover:bg-surfaceHover transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(data)}
            disabled={!data.name}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Save Item
          </button>
        </div>
      </div>
    </div>
  );
}

function strengthColor(s: string) {
  if (s === "weak") return "text-red-500";
  if (s === "fair") return "text-yellow-500";
  return "text-accent";
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground/80">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
      />
    </div>
  );
}
