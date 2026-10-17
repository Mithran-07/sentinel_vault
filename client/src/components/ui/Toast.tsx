"use client";

import React, { createContext, useContext, useState, useCallback, useId } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "warning" | "danger" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextValue {
  showToast: (opts: { type?: ToastType; title?: string; message: string; duration?: number }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-success shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-warning shrink-0" />,
  danger: <XCircle className="w-5 h-5 text-danger shrink-0" />,
  info: <Info className="w-5 h-5 text-info shrink-0" />,
};

const borderColors: Record<ToastType, string> = {
  success: "border-success/35",
  warning: "border-warning/35",
  danger: "border-danger/35",
  info: "border-info/35",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type = "info", title, message, duration = 4000 }: { type?: ToastType; title?: string; message: string; duration?: number }) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((msg: string, title?: string) => showToast({ type: "success", title, message: msg }), [showToast]);
  const error = useCallback((msg: string, title?: string) => showToast({ type: "danger", title, message: msg }), [showToast]);
  const warning = useCallback((msg: string, title?: string) => showToast({ type: "warning", title, message: msg }), [showToast]);
  const info = useCallback((msg: string, title?: string) => showToast({ type: "info", title, message: msg }), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto bg-surface-2/95 backdrop-blur-md border ${borderColors[t.type]} text-fg p-3.5 rounded-xl shadow-pop flex items-start gap-3 animate-toast-in`}
          >
            {icons[t.type]}
            <div className="flex-1 min-w-0">
              {t.title && <div className="text-xs font-semibold text-fg tracking-wide">{t.title}</div>}
              <div className="text-xs text-fg-muted leading-relaxed break-words">{t.message}</div>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-fg-subtle hover:text-fg p-1 rounded-md transition-colors"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback if invoked outside provider
    return {
      showToast: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
    };
  }
  return ctx;
}
