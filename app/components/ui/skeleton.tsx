import { cn } from "~/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl border-2 border-black bg-primary-200/70", className)} />;
}
