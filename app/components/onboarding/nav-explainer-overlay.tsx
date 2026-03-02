import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "~/components/ui/button";
import { DonkeyBubble } from "./donkey-bubble";

type NavStep = {
  id: string;
  focusSelector: string;
  title: string;
  description: ReactNode;
  highlight: "nav" | "element";
  nextLabel?: string;
  navigateTo?: string;
};

const DISCOVERY_TARGET = "__DISCOVERY__";

const NAV_STEPS: NavStep[] = [
  {
    id: "active-project",
    focusSelector: '[data-nav-id="active-project"]',
    title: "Your project",
    highlight: "nav",
    description: (
      <>
        This is your <strong className="text-slate-800">active project</strong>. Click it to see
        project settings. On <strong className="text-slate-800">Growth/Agency</strong> plans you can
        manage multiple projects using the icons on the right.
      </>
    ),
  },
  {
    id: "discovery",
    focusSelector: '[data-nav-id="discovery"]',
    title: "Discovery",
    highlight: "nav",
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
    id: "content",
    focusSelector: '[data-nav-id="content"]',
    title: "Content",
    highlight: "nav",
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
    id: "calendar",
    focusSelector: '[data-nav-id="calendar"]',
    title: "Calendar",
    highlight: "nav",
    description: (
      <>
        A visual <strong className="text-slate-800">planning board</strong> showing when briefs and
        articles are scheduled. Open any day to see{" "}
        <strong className="text-slate-800">status breakdowns</strong> at a glance.
      </>
    ),
  },
  {
    id: "billing",
    focusSelector: '[data-nav-id="billing"]',
    title: "Billing",
    highlight: "nav",
    description: (
      <>
        Manage your <strong className="text-slate-800">subscription</strong> and{" "}
        <strong className="text-slate-800">usage limits</strong>. You can also find docs for the
        Donkey SEO client, webhooks, and <strong className="text-slate-800">CMS integration</strong>.
      </>
    ),
  },
  {
    id: "settings-nav",
    focusSelector: '[data-nav-id="settings"]',
    title: "Settings",
    highlight: "nav",
    nextLabel: "Go to settings",
    description: (
      <>
        Open <strong className="text-slate-800">Settings</strong> to manage your API key, webhooks,
        and the <strong className="text-slate-800">DonkeySEO client install guide</strong> for coding
        agents.
      </>
    ),
  },
  {
    id: "settings-ai-guide",
    focusSelector: '[data-onboarding-focus="settings-ai-guide-copy"]',
    title: "Install DonkeySEO Client",
    highlight: "element",
    navigateTo: "/settings?onboardingTab=ai-guide",
    nextLabel: "Back to discovery",
    description: (
      <>
        This <strong className="text-slate-800">Copy Integration Guide</strong> button gives you the
        agent code and setup instructions. Click it, then give that copied code to your coding
        agent (Claude Code, ChatGPT, or similar) to install the DonkeySEO client integration.
      </>
    ),
  },
  {
    id: "back-to-discovery",
    focusSelector: '[data-nav-id="discovery"]',
    title: "All Set",
    highlight: "nav",
    navigateTo: DISCOVERY_TARGET,
    nextLabel: "Finish tour",
    description: (
      <>
        Everything is configured. You are back in{" "}
        <strong className="text-slate-800">Discovery</strong> while your run continues in progress.
        If you need help, use the <strong className="text-slate-800">support toggle</strong> in the
        bottom-left of the navigation bar.
      </>
    ),
  },
];

type NavExplainerOverlayProps = {
  discoveryPath: string;
  onComplete: () => void;
};

export function NavExplainerOverlay({
  discoveryPath,
  onComplete,
}: NavExplainerOverlayProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const step = NAV_STEPS[stepIndex];
  const isLast = stepIndex === NAV_STEPS.length - 1;

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolveTarget = (target: string) => {
    if (target === DISCOVERY_TARGET) return discoveryPath;
    return target;
  };

  const navigateIfNeeded = (target: string) => {
    const resolvedTarget = resolveTarget(target);
    const [targetPath, targetQuery = ""] = resolvedTarget.split("?");
    const targetSearch = targetQuery ? `?${targetQuery}` : "";
    if (location.pathname === targetPath && location.search === targetSearch) return;
    navigate(resolvedTarget, { replace: true });
  };

  const goToStep = (nextIndex: number) => {
    const nextStep = NAV_STEPS[nextIndex];
    if (nextStep?.navigateTo) {
      navigateIfNeeded(nextStep.navigateTo);
    }
    setStepIndex(nextIndex);
  };

  useEffect(() => {
    const currentStep = NAV_STEPS[stepIndex];
    if (!currentStep?.navigateTo) return;
    const resolvedTarget = resolveTarget(currentStep.navigateTo);
    const [targetPath, targetQuery = ""] = resolvedTarget.split("?");
    const targetSearch = targetQuery ? `?${targetQuery}` : "";
    if (location.pathname === targetPath && location.search === targetSearch) return;
    navigateIfNeeded(currentStep.navigateTo);
  }, [stepIndex, discoveryPath, location.pathname, location.search]);

  // Highlight the current focus target
  useEffect(() => {
    if (!step?.focusSelector) return;
    let timeoutId: number | undefined;
    let highlightedElement: HTMLElement | null = null;
    let previousStyles:
      | {
          position: string;
          zIndex: string;
          background: string;
          borderRadius: string;
          boxShadow: string;
        }
      | null = null;
    let canceled = false;
    let attempts = 0;
    const maxAttempts = 30;

    const tryHighlight = () => {
      if (canceled) return;
      const el = document.querySelector<HTMLElement>(step.focusSelector);
      if (!el) {
        attempts += 1;
        if (attempts < maxAttempts) {
          timeoutId = window.setTimeout(tryHighlight, 100);
        }
        return;
      }

      highlightedElement = el;
      previousStyles = {
        position: el.style.position,
        zIndex: el.style.zIndex,
        background: el.style.background,
        borderRadius: el.style.borderRadius,
        boxShadow: el.style.boxShadow,
      };

      el.style.position = "relative";
      el.style.zIndex = "61";
      el.style.borderRadius = "0.75rem";
      if (step.highlight === "nav") {
        el.style.background = "white";
      } else {
        el.style.boxShadow = "0 0 0 4px rgba(255, 255, 255, 0.8)";
      }
    };

    tryHighlight();

    return () => {
      canceled = true;
      if (typeof timeoutId !== "undefined") {
        window.clearTimeout(timeoutId);
      }
      if (!highlightedElement || !previousStyles) return;
      highlightedElement.style.position = previousStyles.position;
      highlightedElement.style.zIndex = previousStyles.zIndex;
      highlightedElement.style.background = previousStyles.background;
      highlightedElement.style.borderRadius = previousStyles.borderRadius;
      highlightedElement.style.boxShadow = previousStyles.boxShadow;
    };
  }, [step, location.pathname, location.search]);

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
          key={step.id}
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
                  onClick={() => goToStep(stepIndex - 1)}
                >
                  Back
                </Button>
              )}
              {isLast ? (
                <Button type="button" size="lg" onClick={onComplete}>
                  {step.nextLabel ?? "Let's get started!"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => goToStep(stepIndex + 1)}
                >
                  {step.nextLabel ?? "Next"}
                </Button>
              )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
