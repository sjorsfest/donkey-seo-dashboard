import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "~/components/ui/button";

type OnboardingOverlayProps = {
  children: ReactNode;
  onNext?: () => void;
  nextLabel?: string;
};

export function OnboardingOverlay({
  children,
  onNext,
  nextLabel = "Got it!",
}: OnboardingOverlayProps) {
  const [mounted, setMounted] = useState(false);

  // Delay rendering to avoid SSR flash
  useEffect(() => {
    setMounted(true);
  }, []);

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
          className="w-full max-w-lg"
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
