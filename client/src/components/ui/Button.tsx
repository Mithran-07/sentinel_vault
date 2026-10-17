import React from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "subtle"
  | "danger"
  | "dangerGhost"
  | "indigoGhost";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white border border-accent/20 hover:bg-accent-strong shadow-xs active:translate-y-[0.5px]",
  secondary:
    "bg-surface-2 text-fg border border-line hover:border-line-strong hover:bg-surface-3 shadow-xs active:translate-y-[0.5px]",
  ghost:
    "bg-transparent text-fg-muted border border-line hover:text-fg hover:bg-surface-2 active:translate-y-[0.5px]",
  subtle:
    "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2 active:translate-y-[0.5px]",
  danger:
    "bg-danger text-white border border-danger/30 hover:bg-danger/90 shadow-xs active:translate-y-[0.5px]",
  dangerGhost:
    "bg-transparent text-danger border border-danger/30 hover:bg-danger/10 active:translate-y-[0.5px]",
  indigoGhost:
    "bg-accent/10 text-accent border border-accent/25 hover:bg-accent/20 active:translate-y-[0.5px]",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-2xs gap-1 rounded-md",
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-xs font-medium gap-1.5 rounded-md",
  lg: "h-10 px-4 text-sm font-medium gap-2 rounded-md",
  icon: "h-8 w-8 p-0 rounded-md shrink-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      isLoading,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={`inline-flex items-center justify-center font-medium whitespace-nowrap select-none
          transition-[background-color,border-color,color,box-shadow,transform] duration-100 ease-out
          disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none
          ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
