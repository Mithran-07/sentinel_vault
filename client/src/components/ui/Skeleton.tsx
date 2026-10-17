import React from "react";

export function Skeleton({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={`skeleton rounded-md ${className}`} {...props} />;
}
