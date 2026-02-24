import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type DonkeyBubbleProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export function DonkeyBubble({ children, className, title }: DonkeyBubbleProps) {
  return (
    <div className={cn("flex items-start gap-4", className)}>
      <img
        src="/static/donkey.png"
        alt="Donkey SEO mascot"
        className="h-20 w-20 shrink-0 object-contain drop-shadow-md"
      />
      <div className="relative rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_#1a1a1a]">
        {/* triangle pointer toward donkey */}
        <div className="absolute -left-2.5 top-6 h-4 w-4 rotate-45 border-b-2 border-l-2 border-black bg-white" />
        <div className="relative">
          {title ? (
            <p className="font-display text-lg font-bold text-slate-900">
              {title}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
