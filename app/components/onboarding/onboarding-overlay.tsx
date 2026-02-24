import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "~/components/ui/button";

type OnboardingOverlayProps = {
  children: ReactNode;
  onNext?: () => void;
  nextLabel?: string;
  /** CSS selector of an element to visually spotlight behind the overlay */
  focusSelector?: string;
};

export function OnboardingOverlay({
  children,
  onNext,
  nextLabel = "Got it!",
  focusSelector,
}: OnboardingOverlayProps) {
  const [mounted, setMounted] = useState(false);

  // Delay rendering to avoid SSR flash
  useEffect(() => {
    setMounted(true);
  }, []);

  // Highlight the focused element above the backdrop
  useEffect(() => {
    if (!focusSelector) return;
    const el = document.querySelector<HTMLElement>(focusSelector);
    if (!el) return;

    const prev = {
      position: el.style.position,
      zIndex: el.style.zIndex,
      borderRadius: el.style.borderRadius,
    };

    el.style.position = "relative";
    el.style.zIndex = "61";
    el.style.borderRadius = "1rem";

    return () => {
      el.style.position = prev.position;
      el.style.zIndex = prev.zIndex;
      el.style.borderRadius = prev.borderRadius;
    };
  }, [focusSelector]);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className={`w-full max-w-lg ${focusSelector ? "z-[62]" : ""}`}
        >
          {children}

          {onNext ? (
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={onNext} size="lg">
                {nextLabel}
              </Button>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
