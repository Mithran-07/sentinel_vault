"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface SessionRecord {
  id: string;
  browser: string;
  os: string;
  deviceType?: string;
  isSuspicious?: boolean;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function ActiveSessions() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await api.get("/auth/sessions");
      if (res.ok) {
        const data: SessionRecord[] = await res.json();
        setSessions(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(sessionId: string, isCurrent: boolean) {
    const promptMsg = isCurrent
      ? "Revoke your current session? You will be logged out immediately."
      : "Revoke this active session? The device will be logged out.";

    if (!window.confirm(promptMsg)) return;

    setRevokingId(sessionId);
    try {
      const res = await api.del(`/auth/sessions/${sessionId}`);
      if (res.ok) {
        if (isCurrent) {
          window.location.href = "/login";
          return;
        }
        await loadSessions();
      }
    } finally {
      setRevokingId(null);
    }
  }

  async function handleLogoutAllOthers() {
    const otherCount = sessions.filter((s) => !s.isCurrent).length;
    if (!window.confirm(`Disconnect ${otherCount} other device(s)? All other active sessions will be logged out.`)) return;

    try {
      const res = await api.post("/auth/sessions/revoke-others");
      if (res.ok) {
        await loadSessions();
      }
    } catch {
      // Ignore
    }
  }

  function getDeviceIcon(type?: string, osStr?: string) {
    if (type === "mobile") return "📱";
    if (type === "tablet") return "📟";
    const lowerOs = (osStr || "").toLowerCase();
    if (lowerOs.includes("mac") || lowerOs.includes("darwin")) return "💻";
    if (lowerOs.includes("win")) return "🖥️";
    return "💻";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Active Sessions & Devices</h2>
          <p className="text-xs text-foreground/50 mt-0.5">
            Manage devices currently signed into your zero-knowledge vault session.
          </p>
        </div>
        {sessions.length > 1 && (
          <button
            onClick={handleLogoutAllOthers}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Logout All Other Devices
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-foreground/50">
          <svg className="animate-spin h-6 w-6 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-foreground/50 py-4">No active sessions found.</p>
      ) : (
        <div className="grid gap-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all ${
                s.isCurrent
                  ? "border-accent/40 bg-accent/5 shadow-sm"
                  : s.isSuspicious
                  ? "border-amber-500/40 bg-amber-500/5 shadow-sm"
                  : "border-border bg-surface"
              }`}
            >
              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center text-lg shrink-0">
                  {getDeviceIcon(s.deviceType, s.os)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground text-sm">{s.browser}</span>
                    <span className="text-xs text-foreground/50">on {s.os}</span>
                    {s.isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-accent text-white text-[10px] font-semibold tracking-wide uppercase">
                        This Device
                      </span>
                    )}
                    {s.isSuspicious && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold tracking-wide uppercase">
                        Unrecognized Device
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/50 mt-0.5">
                    IP: {s.ipAddress} · Last active: {new Date(s.lastActiveAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <button
                disabled={revokingId === s.id}
                onClick={() => handleRevoke(s.id, s.isCurrent)}
                className="px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-foreground/70 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50"
              >
                {revokingId === s.id ? "Revoking..." : s.isCurrent ? "Sign Out" : "Revoke Session"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
