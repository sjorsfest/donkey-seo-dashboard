import type { components } from "~/types/api.generated";
import type { DashboardTab, SetupPreset, StepArtifactContext } from "~/types/dashboard";

type StepExecutionResponse = components["schemas"]["StepExecutionResponse"];
type ProjectGoals = components["schemas"]["ProjectGoals"];
type ProjectConstraints = components["schemas"]["ProjectConstraints"];

const SUCCESS_STATUSES = new Set(["completed", "success", "succeeded", "done"]);
const FAILED_STATUSES = new Set(["failed", "error"]);
const ACTIVE_STATUSES = new Set(["queued", "running", "in_progress"]);

export function formatStatusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return status
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function isRunActive(status: string | null | undefined) {
  return ACTIVE_STATUSES.has(String(status ?? "").toLowerCase());
}

export function isRunPaused(status: string | null | undefined) {
  return String(status ?? "").toLowerCase() === "paused";
}

export function isRunFailed(status: string | null | undefined) {
  return FAILED_STATUSES.has(String(status ?? "").toLowerCase());
}

export function getStatusBadgeClass(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();

  if (SUCCESS_STATUSES.has(normalized)) {
    return "border-emerald-300 bg-emerald-100 text-emerald-900";
  }
  if (FAILED_STATUSES.has(normalized)) {
    return "border-rose-300 bg-rose-100 text-rose-900";
  }
  if (ACTIVE_STATUSES.has(normalized)) {
    return "border-amber-300 bg-amber-100 text-amber-900";
  }
  if (normalized === "paused") {
    return "border-indigo-300 bg-indigo-100 text-indigo-900";
  }

  return "border-slate-300 bg-slate-100 text-slate-800";
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function summarizeSteps(steps: StepExecutionResponse[]) {
  return steps.reduce(
    (acc, step) => {
      const normalized = String(step.status).toLowerCase();
      if (SUCCESS_STATUSES.has(normalized)) {
        acc.succeeded += 1;
      } else if (FAILED_STATUSES.has(normalized)) {
        acc.failed += 1;
      } else if (normalized === "running" || normalized === "in_progress" || normalized === "queued") {
        acc.active += 1;
      } else {
        acc.other += 1;
      }
      return acc;
    },
    { succeeded: 0, failed: 0, active: 0, other: 0 }
  );
}

export function inferStepTabs(stepName: string): DashboardTab[] {
  const normalized = stepName.toLowerCase();
  const tabs: DashboardTab[] = [];

  if (normalized.includes("keyword")) tabs.push("keywords");
  if (normalized.includes("topic") || normalized.includes("cluster")) tabs.push("topics");
  if (normalized.includes("brief") || normalized.includes("writer") || normalized.includes("content")) tabs.push("briefs");

  if (tabs.length === 0) {
    tabs.push("status");
  }

  return tabs;
}

export function toStepArtifactContext(step: StepExecutionResponse): StepArtifactContext {
  return {
    stepId: step.id,
    stepNumber: step.step_number,
    stepName: step.step_name,
    status: step.status,
    progressMessage: step.progress_message,
    itemsProcessed: step.items_processed,
    itemsTotal: step.items_total,
    errorMessage: step.error_message,
    relatedTabs: inferStepTabs(step.step_name),
  };
}

export function parseMultilineList(input: string) {
  return input
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function humanizeReasonFragment(fragment: string) {
  return fragment
    .split(/[_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function formatDiscoveryRejectionReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) return "Unknown reason";

  const lowercase = normalized.toLowerCase();
  if (lowercase === "intent_mismatch_off_goal" || lowercase.startsWith("goal_intent_mismatch:")) {
    return "Intent is off-goal for selected preset.";
  }

  const [primary, detail] = normalized.split(":", 2);
  if (!detail) return humanizeReasonFragment(primary);
  return `${humanizeReasonFragment(primary)}: ${humanizeReasonFragment(detail)}`;
}

export function normalizeDomain(input: string) {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*/, "")
    .toLowerCase();
}

export function suggestProjectNameFromDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return "";
  const root = normalized.split(".")[0] ?? "";
  if (!root) return "";

  return root
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildPresetGoals(preset: SetupPreset): ProjectGoals {
  if (preset === "lead_generation") {
    return {
      primary_objective: "lead_generation",
      secondary_goals: ["qualified_leads", "demo_requests"],
      priority_topics: ["solution comparisons", "buyer guides"],
      excluded_topics: ["broad awareness"],
    };
  }

  if (preset === "revenue_content") {
    return {
      primary_objective: "revenue_content",
      secondary_goals: ["high_intent_sessions", "product_page_assists"],
      priority_topics: ["alternatives", "pricing context", "use case pages"],
      excluded_topics: ["general definitions"],
    };
  }

  return {
    primary_objective: "traffic_growth",
    secondary_goals: ["brand_visibility", "topical_authority"],
    priority_topics: ["foundational education", "how-to content"],
    excluded_topics: ["off-topic trends"],
  };
}

export function buildPresetConstraints(preset: SetupPreset): ProjectConstraints {
  if (preset === "lead_generation") {
    return {
      budget_tier: "medium",
      content_team_size: 2,
      max_difficulty_score: 65,
      min_search_volume: 30,
      exclude_branded_keywords: false,
      max_keywords_to_target: 220,
    };
  }

  if (preset === "revenue_content") {
    return {
      budget_tier: "high",
      content_team_size: 3,
      max_difficulty_score: 75,
      min_search_volume: 20,
      exclude_branded_keywords: false,
      max_keywords_to_target: 260,
    };
  }

  return {
    budget_tier: "medium",
    content_team_size: 1,
    max_difficulty_score: 60,
    min_search_volume: 50,
    exclude_branded_keywords: true,
    max_keywords_to_target: 180,
  };
}
