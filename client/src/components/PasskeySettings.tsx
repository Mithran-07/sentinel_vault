"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { api } from "@/lib/api";

export interface PasskeyRecord {
  id: string;
  credentialId: string;
  name: string | null;
  deviceType: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Rename Modal State
  const [editingPasskey, setEditingPasskey] = useState<PasskeyRecord | null>(null);
  const [newName, setNewName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void loadPasskeys();
  }, []);

  async function loadPasskeys() {
    setLoading(true);
    try {
      const res = await api.get("/auth/passkeys");
      if (res.ok) {
        const data: PasskeyRecord[] = await res.json();
        setPasskeys(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPasskey() {
    setError(null);
    setSuccessMsg(null);
    setBusy(true);

    try {
      // 1. Begin registration
      const beginRes = await api.post("/auth/passkeys/register/begin");
      if (!beginRes.ok) throw new Error("Failed to initiate passkey registration");
      const { options, challengeId } = await beginRes.json();

      // 2. Invoke browser WebAuthn prompt
      const attResp = await startRegistration(options);

      // 3. Complete registration
      const completeRes = await api.post("/auth/passkeys/register/complete", {
        challengeId,
        name: "Security Key / Passkey",
        response: attResp,
      });

      if (!completeRes.ok) {
        const body = await completeRes.json().catch(() => ({}));
        throw new Error(body.error || "Passkey registration verification failed");
      }

      setSuccessMsg("Passkey registered successfully!");
      await loadPasskeys();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("Passkey registration cancelled by user.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to register passkey");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPasskey) return;

    setRenameBusy(true);
    setError(null);
    try {
      const res = await api.patch(`/auth/passkeys/${editingPasskey.id}`, { name: newName });
      if (!res.ok) throw new Error("Failed to rename passkey");
      setEditingPasskey(null);
      await loadPasskeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenameBusy(false);
    }
  }

  async function handleRemove(id: string, name: string | null) {
    if (!window.confirm(`Are you sure you want to remove passkey "${name || "Passkey"}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    setError(null);
    try {
      const res = await api.del(`/auth/passkeys/${id}`);
      if (!res.ok) throw new Error("Failed to remove passkey");
      await loadPasskeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Removal failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6 border-b border-border/50 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">Passkeys & Hardware Keys</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-accent/10 text-accent border border-accent/20">
              WebAuthn / FIDO2
            </span>
          </div>
          <p className="text-xs text-foreground/50 mt-1">
            Log in passwordlessly or with phishing-resistant hardware security keys (Touch ID, Face ID, YubiKey).
          </p>
        </div>

        <button
          disabled={busy}
          onClick={handleAddPasskey}
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {busy ? (
            <span>Initiating WebAuthn...</span>
          ) : (
            <>
              <span>+ Add a Passkey</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-24 text-foreground/50">
          <svg className="animate-spin h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        </div>
      ) : passkeys.length === 0 ? (
        <div className="p-6 rounded-xl border border-dashed border-border text-center bg-surface/30 space-y-2">
          <p className="text-sm font-medium text-foreground/70">No passkeys registered yet</p>
          <p className="text-xs text-foreground/40 max-w-sm mx-auto">
            Add your device's Touch ID, Face ID, or a USB security key for fast, hardware-secured authentication.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-surface">
              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center text-lg shrink-0">
                  🔑
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm">{pk.name || "Passkey"}</span>
                    <span className="text-[10px] text-foreground/50 uppercase px-1.5 py-0.5 rounded bg-background border border-border font-mono">
                      {pk.deviceType || "Passkey"}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/50 mt-0.5">
                    Added: {new Date(pk.createdAt).toLocaleDateString()} · Last used: {pk.lastUsedAt ? new Date(pk.lastUsedAt).toLocaleString() : "Never"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingPasskey(pk);
                    setNewName(pk.name || "Security Key");
                  }}
                  className="px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
                >
                  Rename
                </button>
                <button
                  disabled={deletingId === pk.id}
                  onClick={() => handleRemove(pk.id, pk.name)}
                  className="px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-foreground/70 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50"
                >
                  {deletingId === pk.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename Modal */}
      {editingPasskey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="text-sm font-bold text-foreground">Rename Passkey</h3>
              <button onClick={() => setEditingPasskey(null)} className="text-foreground/40 hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground/80">Friendly Name:</label>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPasskey(null)}
                  className="flex-1 py-2 rounded-lg border border-border text-xs text-foreground/70 hover:bg-surfaceHover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renameBusy || !newName.trim()}
                  className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  {renameBusy ? "Saving..." : "Save Name"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
