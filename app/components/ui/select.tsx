import * as React from "react";
import { cn } from "~/lib/utils";

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border-2 border-black bg-white px-3 text-sm text-foreground shadow-[2px_2px_0_#1a1a1a] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background",
        className
      )}
      {...props}
    />
  )
);
Select.displayName = "Select";

export { Select };
