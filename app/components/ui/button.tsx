import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50 interactive-hover",
  {
    variants: {
      variant: {
        default:
          "border-2 border-black bg-primary text-primary-foreground shadow-[2px_2px_0_#1a1a1a] hover:brightness-95",
        secondary:
          "border-2 border-black bg-secondary text-secondary-foreground shadow-[2px_2px_0_#1a1a1a] hover:brightness-95",
        outline:
          "border-2 border-black bg-card text-foreground shadow-[2px_2px_0_#1a1a1a] hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "border-2 border-black bg-destructive text-destructive-foreground shadow-[2px_2px_0_#1a1a1a] hover:brightness-95",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
