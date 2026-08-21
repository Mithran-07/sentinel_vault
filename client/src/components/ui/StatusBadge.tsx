import React from "react";

export type BadgeVariant = "active" | "warning" | "danger" | "info";

export const StatusBadge = ({ variant, icon, children }: { variant: BadgeVariant, icon?: React.ReactNode, children: React.ReactNode }) => {
  const baseClasses = "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full";
  
  const variants = {
    active: "bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]",
    warning: "bg-[#fffbeb] text-[#b45309] border border-[#fde68a]",
    danger: "bg-[#fff1f2] text-[#be123c] border border-[#fecdd3]",
    info: "bg-[#eef2ff] text-[#4338ca] border border-[#c7d2fe]"
  };

  return (
    <span className={`${baseClasses} ${variants[variant]}`}>
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
