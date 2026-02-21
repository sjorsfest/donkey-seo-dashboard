import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "~/components/ui/button";
import { DonkeyBubble } from "./donkey-bubble";

const NAV_STEPS = [
  {
    navId: "projects",
    title: "Projects",
    description:
      "This is where you manage your brand info and main content strategy. Each project is tied to a website domain.",
  },
  {
    navId: "discovery",
    title: "Discovery",
    description:
      "Here you can see the keywords we examine, topics we create for you, and how often the research loop runs.",
  },
  {
    navId: "content",
    title: "Content",
    description:
      "This is where you'll find articles written based on the topics we discover. Review, edit, and publish them from here.",
  },
  {
    navId: "calendar",
    title: "Calendar",
    description:
      "Use this planning board to see exactly when briefs and articles are scheduled, then open a day for status breakdowns.",
  },
  {
    navId: "configuration",
    title: "Configuration",
    description:
      "Find docs for setting up the Donkey SEO client in your repo, handling incoming webhooks, and automatic CMS integration.",
  },
];

type NavExplainerOverlayProps = {
  onComplete: () => void;
};

export function NavExplainerOverlay({
  onComplete,
}: NavExplainerOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const step = NAV_STEPS[stepIndex];
  const isLast = stepIndex === NAV_STEPS.length - 1;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Highlight the current nav item
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(
      `[data-nav-id="${step.navId}"]`
    );
    if (!el) return;

    const prev = {
      position: el.style.position,
      zIndex: el.style.zIndex,
      background: el.style.background,
      borderRadius: el.style.borderRadius,
      padding: el.style.padding,
    };

    el.style.position = "relative";
    el.style.zIndex = "61";
    el.style.background = "white";
    el.style.borderRadius = "0.75rem";

    return () => {
      el.style.position = prev.position;
      el.style.zIndex = prev.zIndex;
      el.style.background = prev.background;
      el.style.borderRadius = prev.borderRadius;
    };
  }, [step]);

  if (!mounted || !step) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="nav-explainer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      >
        <motion.div
          key={step.navId}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-lg"
        >
          <DonkeyBubble>
            <p className="font-display text-lg font-bold text-slate-900">
              {step.title}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {step.description}
            </p>
          </DonkeyBubble>

          {/* progress dots */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            {NAV_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === stepIndex ? "bg-white" : "bg-white/40"
                }`}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
              {stepIndex > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStepIndex((p) => p - 1)}
                >
                  Back
                </Button>
              )}
              {isLast ? (
                <Button type="button" size="lg" onClick={onComplete}>
                  Let's get started!
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => setStepIndex((p) => p + 1)}
                >
                  Next
                </Button>
              )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
