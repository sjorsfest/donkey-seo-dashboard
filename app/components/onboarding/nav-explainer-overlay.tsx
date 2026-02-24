import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "~/components/ui/button";
import { DonkeyBubble } from "./donkey-bubble";

const NAV_STEPS: Array<{ navId: string; title: string; description: ReactNode }> = [
  {
    navId: "active-project",
    title: "Your project",
    description: (
      <>
        This is your <strong className="text-slate-800">active project</strong>. Click it to see
        project settings. On <strong className="text-slate-800">Growth/Agency</strong> plans you can
        manage multiple projects using the icons on the right.
      </>
    ),
  },
  {
    navId: "discovery",
    title: "Discovery",
    description: (
      <>
        This is where the magic happens. See the{" "}
        <strong className="text-slate-800">keywords</strong> I'm researching, the{" "}
        <strong className="text-slate-800">topics</strong> I create for you, and track each{" "}
        <strong className="text-slate-800">research loop</strong> as it runs.
      </>
    ),
  },
  {
    navId: "content",
    title: "Content",
    description: (
      <>
        Find all <strong className="text-slate-800">articles</strong> written from discovered topics.
        You can <strong className="text-slate-800">review</strong>,{" "}
        <strong className="text-slate-800">edit</strong>, and{" "}
        <strong className="text-slate-800">publish</strong> them directly from here.
      </>
    ),
  },
  {
    navId: "calendar",
    title: "Calendar",
    description: (
      <>
        A visual <strong className="text-slate-800">planning board</strong> showing when briefs and
        articles are scheduled. Open any day to see{" "}
        <strong className="text-slate-800">status breakdowns</strong> at a glance.
      </>
    ),
  },
  {
    navId: "billing",
    title: "Billing",
    description: (
      <>
        Manage your <strong className="text-slate-800">subscription</strong> and{" "}
        <strong className="text-slate-800">usage limits</strong>. You can also find docs for the
        Donkey SEO client, webhooks, and <strong className="text-slate-800">CMS integration</strong>.
      </>
    ),
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
          <DonkeyBubble title={step.title}>
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
