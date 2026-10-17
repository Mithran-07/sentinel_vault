import React, { useId } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
  label?: string;
  hint?: string;
  trailing?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, icon, label, hint, trailing, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const descId = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle [&>svg]:w-4 [&>svg]:h-4">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={descId}
            className={`field ${icon ? "pl-9" : ""} ${trailing ? "pr-10" : ""} ${
              error ? "border-danger focus:border-danger focus:ring-danger/25" : ""
            } ${className}`}
            {...props}
          />
          {trailing && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>}
        </div>
        {error ? (
          <p id={descId} role="alert" className="mt-1.5 text-xs text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={descId} className="mt-1.5 text-xs text-fg-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
