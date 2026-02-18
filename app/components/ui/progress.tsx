import * as React from "react";
import { cn } from "~/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function Progress({ value, className, ...props }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-200", className)}
      role="progressbar"
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div className="h-full rounded-full bg-gradient-to-r from-[#2f6f71] to-[#5f79a8]" style={{ width: `${safeValue}%` }} />
    </div>
  );
}
