export type OnboardingPhase =
  | "welcome"
  | "strategy"
  | "setup_progress"
  | "congratulations"
  | "nav_explainer"
  | "completed";

export type OnboardingState = {
  phase: OnboardingPhase;
  isActive: boolean;
  projectId: string | null;
  runId: string | null;
  dismissedAt: string | null;
};

const ONBOARDING_STORAGE_KEY = "donkeyseo_onboarding";

const PHASE_TRANSITIONS: Record<OnboardingPhase, OnboardingPhase> = {
  welcome: "strategy",
  strategy: "setup_progress",
  setup_progress: "congratulations",
  congratulations: "nav_explainer",
  nav_explainer: "completed",
  completed: "completed",
};

export function loadOnboardingState(): OnboardingState {
  if (typeof window === "undefined") {
    return defaultState();
  }
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as OnboardingState;
  } catch {
    // corrupted storage, reset
  }
  return defaultState();
}

export function saveOnboardingState(state: OnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
}

export function initializeOnboarding(): OnboardingState {
  const state: OnboardingState = {
    phase: "welcome",
    isActive: true,
    projectId: null,
    runId: null,
    dismissedAt: null,
  };
  saveOnboardingState(state);
  return state;
}

export function advanceOnboarding(
  current: OnboardingState,
  updates?: Partial<Pick<OnboardingState, "projectId" | "runId">>
): OnboardingState {
  const next: OnboardingState = {
    ...current,
    ...updates,
    phase: PHASE_TRANSITIONS[current.phase],
  };
  if (next.phase === "completed") {
    next.isActive = false;
    next.dismissedAt = new Date().toISOString();
  }
  saveOnboardingState(next);
  return next;
}

export function completeOnboarding(current: OnboardingState): OnboardingState {
  const state: OnboardingState = {
    ...current,
    phase: "completed",
    isActive: false,
    dismissedAt: new Date().toISOString(),
  };
  saveOnboardingState(state);
  return state;
}

function defaultState(): OnboardingState {
  return {
    phase: "completed",
    isActive: false,
    projectId: null,
    runId: null,
    dismissedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Country → locale mapping
// ---------------------------------------------------------------------------

export const COUNTRY_OPTIONS = [
  { value: "worldwide", label: "Worldwide" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "NL", label: "Netherlands" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "IN", label: "India" },
] as const;

const LOCALE_MAP: Record<string, { locale: string; language: string }> = {
  worldwide: { locale: "en-US", language: "en" },
  US: { locale: "en-US", language: "en" },
  GB: { locale: "en-GB", language: "en" },
  CA: { locale: "en-CA", language: "en" },
  AU: { locale: "en-AU", language: "en" },
  DE: { locale: "de-DE", language: "de" },
  FR: { locale: "fr-FR", language: "fr" },
  NL: { locale: "nl-NL", language: "nl" },
  ES: { locale: "es-ES", language: "es" },
  IT: { locale: "it-IT", language: "it" },
  IN: { locale: "en-IN", language: "en" },
};

export function countryToLocale(country: string): {
  locale: string;
  language: string;
} {
  return LOCALE_MAP[country] ?? LOCALE_MAP.worldwide;
}
