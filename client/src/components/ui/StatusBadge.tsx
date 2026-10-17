import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

export type BadgeVariant = "active" | "warning" | "danger" | "info";

const styles: Record<BadgeVariant, string> = {
  active: "bg-success/12 text-success border-success/35",
  warning: "bg-warning/12 text-warning border-warning/35",
  danger: "bg-danger/12 text-danger border-danger/35",
  info: "bg-info/12 text-info border-info/35",
};

// Default icons guarantee status is never communicated by colour alone.
const defaultIcons: Record<BadgeVariant, React.ReactNode> = {
  active: <CheckCircle2 className="w-3 h-3" aria-hidden />,
  warning: <AlertTriangle className="w-3 h-3" aria-hidden />,
  danger: <XCircle className="w-3 h-3" aria-hidden />,
  info: <Info className="w-3 h-3" aria-hidden />,
};

export const StatusBadge = ({ variant, icon, children }: { variant: BadgeVariant; icon?: React.ReactNode; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-semibold ${styles[variant]}`}>
    <span className="flex-shrink-0">{icon ?? defaultIcons[variant]}</span>
    {children}
  </span>
);
