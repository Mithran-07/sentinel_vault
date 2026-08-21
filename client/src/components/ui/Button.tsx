import React from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "ghost" | "danger" | "dangerGhost" | "indigoGhost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", isLoading, children, disabled, ...props }, ref) => {
    const baseClasses = "inline-flex items-center justify-center font-semibold rounded-[10px] px-6 py-2.5 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-sm";
    
    const variants = {
      primary: "bg-[#4f46e5] text-white shadow-[0_4px_12px_rgba(79,70,229,0.35)] hover:bg-[#4338ca] active:bg-[#3730a3]",
      ghost: "bg-white text-slate-600 font-medium border border-slate-200 hover:bg-slate-50 hover:border-slate-300",
      danger: "bg-[#f43f5e] text-white shadow-[0_4px_12px_rgba(244,63,94,0.30)] hover:bg-[#e11d48]",
      dangerGhost: "bg-white text-[#e11d48] font-medium border border-[#fecdd3] hover:bg-[#fff1f2]",
      indigoGhost: "bg-[#eef2ff] text-[#4f46e5] font-medium border border-[#c7d2fe] hover:bg-[#e0e7ff]"
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseClasses} ${variants[variant]} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
