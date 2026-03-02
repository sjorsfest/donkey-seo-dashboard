import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useNavigation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
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
const ELEMENT_STEP_WIDTH = 680;
const OVERLAY_MARGIN = 16;

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
  const navigation = useNavigation();
  const location = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [targetReady, setTargetReady] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
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

  useEffect(() => {
    setTargetRect(null);
    setTargetReady(step?.highlight === "nav");
  }, [step?.id, step?.highlight]);

  // Highlight the current focus target
  useEffect(() => {
    if (!step?.focusSelector) return;
    let timeoutId: number | undefined;
    let rectRafId: number | undefined;
    let resizeObserver: ResizeObserver | null = null;
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
    const maxAttempts = 150;

    const updateRect = () => {
      if (!highlightedElement) return;
      setTargetRect(highlightedElement.getBoundingClientRect());
    };

    const scheduleRectUpdate = () => {
      if (typeof rectRafId !== "undefined") {
        window.cancelAnimationFrame(rectRafId);
      }
      rectRafId = window.requestAnimationFrame(updateRect);
    };

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
      setTargetReady(true);
      previousStyles = {
        position: el.style.position,
        zIndex: el.style.zIndex,
        background: el.style.background,
        borderRadius: el.style.borderRadius,
        boxShadow: el.style.boxShadow,
      };

      el.style.position = "relative";
      el.style.zIndex = step.highlight === "element" ? "80" : "61";
      el.style.borderRadius = "0.75rem";
      if (step.highlight === "nav") {
        el.style.background = "white";
      } else {
        el.style.boxShadow = "0 0 0 4px rgba(255, 255, 255, 0.8)";
      }

      scheduleRectUpdate();
      window.addEventListener("resize", scheduleRectUpdate);
      window.addEventListener("scroll", scheduleRectUpdate, true);
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(scheduleRectUpdate);
        resizeObserver.observe(el);
      }
    };

    tryHighlight();

    return () => {
      canceled = true;
      if (typeof timeoutId !== "undefined") {
        window.clearTimeout(timeoutId);
      }
      if (typeof rectRafId !== "undefined") {
        window.cancelAnimationFrame(rectRafId);
      }
      window.removeEventListener("resize", scheduleRectUpdate);
      window.removeEventListener("scroll", scheduleRectUpdate, true);
      resizeObserver?.disconnect();
      if (!highlightedElement || !previousStyles) return;
      highlightedElement.style.position = previousStyles.position;
      highlightedElement.style.zIndex = previousStyles.zIndex;
      highlightedElement.style.background = previousStyles.background;
      highlightedElement.style.borderRadius = previousStyles.borderRadius;
      highlightedElement.style.boxShadow = previousStyles.boxShadow;
    };
  }, [step, location.pathname, location.search]);

  if (!mounted || !step) return null;

  const currentRouteMatchesStep = (() => {
    if (!step.navigateTo) return true;
    const resolvedTarget = resolveTarget(step.navigateTo);
    const [targetPath, targetQuery = ""] = resolvedTarget.split("?");
    const targetSearch = targetQuery ? `?${targetQuery}` : "";
    return location.pathname === targetPath && location.search === targetSearch;
  })();

  const waitingForElementStep =
    step.highlight === "element" &&
    (!currentRouteMatchesStep || navigation.state !== "idle" || !targetReady || !targetRect);

  const anchoredBubbleStyle = (() => {
    if (step.highlight !== "element" || waitingForElementStep || !targetRect) return undefined;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const bubbleWidth = Math.min(ELEMENT_STEP_WIDTH, viewportWidth - OVERLAY_MARGIN * 2);
    const desiredLeft = targetRect.left + targetRect.width / 2 - bubbleWidth / 2;
    const clampedLeft = Math.max(
      OVERLAY_MARGIN,
      Math.min(desiredLeft, viewportWidth - bubbleWidth - OVERLAY_MARGIN)
    );
    const showBelow = viewportHeight - targetRect.bottom >= 280 || viewportHeight - targetRect.bottom >= targetRect.top;

    if (showBelow) {
      return {
        position: "fixed" as const,
        left: `${clampedLeft}px`,
        top: `${targetRect.bottom + 18}px`,
        width: `${bubbleWidth}px`,
      };
    }

    return {
      position: "fixed" as const,
      left: `${clampedLeft}px`,
      top: `${Math.max(20, targetRect.top - 18)}px`,
      transform: "translateY(-100%)",
      width: `${bubbleWidth}px`,
    };
  })();

  const isAnchoredElementStep = step.highlight === "element" && !waitingForElementStep;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="nav-explainer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm ${
          isAnchoredElementStep ? "pointer-events-none" : "flex items-center justify-center p-4"
        }`}
      >
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className={isAnchoredElementStep ? "pointer-events-auto" : "w-full max-w-lg"}
          style={anchoredBubbleStyle}
        >
          {waitingForElementStep ? (
            <div className="w-full max-w-md rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_#1a1a1a]">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Loading Settings…</p>
                  <p className="text-xs text-slate-600">
                    Waiting for the integration guide button to finish rendering.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <DonkeyBubble title={step.title}>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {step.description}
              </p>
            </DonkeyBubble>
          )}

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

          <div className="mt-3 flex items-center justify-end gap-2 pointer-events-auto">
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
                disabled={waitingForElementStep}
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
