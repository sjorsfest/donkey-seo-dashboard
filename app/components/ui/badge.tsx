import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-2 border-black px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide shadow-[1.5px_1.5px_0_#1a1a1a]",
  {
    variants: {
      variant: {
        default: "bg-primary text-foreground",
        success: "bg-emerald-300 text-emerald-950",
        warning: "bg-amber-300 text-amber-950",
        danger: "bg-rose-300 text-rose-950",
        info: "bg-sky-300 text-sky-950",
        muted: "bg-muted text-muted-foreground",
        fun: "bg-gradient-to-r from-secondary-700 to-secondary-300 text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
