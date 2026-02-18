import * as React from "react";
import { cn } from "~/lib/utils";

export function Accordion({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2", className)} {...props} />;
}

export function AccordionItem({ className, ...props }: React.ComponentPropsWithoutRef<"details">) {
  return <details className={cn("rounded-xl border border-slate-200 bg-white", className)} {...props} />;
}

export function AccordionTrigger({ className, ...props }: React.ComponentPropsWithoutRef<"summary">) {
  return (
    <summary
      className={cn("cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 marker:content-['']", className)}
      {...props}
    />
  );
}

export function AccordionContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-slate-200 px-4 py-3 text-sm text-slate-600", className)} {...props} />;
}
