import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, icon, ...props }, ref) => {
    return (
      <div className="w-full relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={`
            w-full bg-white border border-slate-200 rounded-[10px] px-3.5 py-2.5 
            text-sm text-slate-900 placeholder:text-slate-400 
            focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1] 
            transition-all duration-150
            ${icon ? "pl-10" : ""}
            ${error ? "border-danger focus:ring-danger/20 focus:border-danger" : ""}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
