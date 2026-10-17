import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "secondary"
    | "neutral"
    | "destructive"
    | "outline"
    | "accent"
    | "success"
    | "warning"
    | "info";
  size?: "sm" | "md" | "lg";
}

const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-surface-3 text-fg border-line",
  secondary: "bg-surface-2 text-fg-muted border-line",
  neutral: "bg-surface-2 text-fg-muted border-line",
  destructive: "bg-danger/12 text-danger border-danger/35",
  outline: "bg-transparent text-fg-muted border-line",
  accent: "bg-accent/10 text-accent border-accent/30",
  success: "bg-success/12 text-success border-success/35",
  warning: "bg-warning/12 text-warning border-warning/35",
  info: "bg-info/12 text-info border-info/35",
};

const sizes: Record<NonNullable<BadgeProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-xs",
};

export function Badge({
  className = "",
  variant = "default",
  size = "md",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold rounded-md border ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
