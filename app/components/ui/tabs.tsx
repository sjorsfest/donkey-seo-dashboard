import * as React from "react";
import { cn } from "~/lib/utils";

export function Tabs({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-4", className)} {...props} />;
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex w-full flex-wrap gap-2 rounded-2xl border-2 border-black bg-muted p-1.5 shadow-[2px_2px_0_#1a1a1a]",
        className
      )}
      {...props}
    />
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function TabsTrigger({ className, active, ...props }: TabsTriggerProps) {
  return (
    <button
      className={cn(
        "rounded-xl border-2 border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors",
        active
          ? "border-black bg-card text-foreground shadow-[2px_2px_0_#1a1a1a]"
          : "hover:bg-card/80 hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-4", className)} {...props} />;
}
