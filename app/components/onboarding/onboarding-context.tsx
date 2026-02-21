import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  advanceOnboarding,
  completeOnboarding,
  initializeOnboarding,
  loadOnboardingState,
  type OnboardingPhase,
  type OnboardingState,
} from "~/lib/onboarding";

type OnboardingContextValue = {
  state: OnboardingState;
  advance: (updates?: Partial<Pick<OnboardingState, "projectId" | "runId">>) => void;
  skipOnboarding: () => void;
  isPhase: (phase: OnboardingPhase) => boolean;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  children,
  projectCount,
}: {
  children: ReactNode;
  projectCount: number;
}) {
  const [state, setState] = useState<OnboardingState>(() => {
    const stored = loadOnboardingState();
    // Already completed or in progress — use stored value
    if (stored.isActive || stored.dismissedAt) {
      return stored;
    }
    // First time, 0 projects → start onboarding
    if (projectCount === 0) {
      return initializeOnboarding();
    }
    return stored;
  });

  const advance = useCallback(
    (updates?: Partial<Pick<OnboardingState, "projectId" | "runId">>) => {
      setState((prev) => advanceOnboarding(prev, updates));
    },
    []
  );

  const skipOnboarding = useCallback(() => {
    setState((prev) => completeOnboarding(prev));
  }, []);

  const isPhase = useCallback(
    (phase: OnboardingPhase) => state.isActive && state.phase === phase,
    [state.isActive, state.phase]
  );

  return (
    <OnboardingContext.Provider value={{ state, advance, isPhase, skipOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}
