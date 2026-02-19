import type { ClassifiedPipelineRun } from "~/lib/pipeline-phase";
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

export function formatStepName(value: string | null | undefined) {
  if (!value) return "Unnamed Step";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

export function formatStepItems(step: StepExecutionResponse) {
  return step.items_total === null
    ? `${step.items_processed} items processed`
    : `${step.items_processed}/${step.items_total} items processed`;
}

export function getStepExecutionTimestamp(step: StepExecutionResponse) {
  const value = step.completed_at ?? step.started_at;
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function calculateOverallProgress(steps: StepExecutionResponse[]) {
  if (steps.length === 0) return 0;
  const total = steps.reduce((acc, step) => acc + step.progress_percent, 0);
  return Math.round(total / steps.length);
}

export function formatTimelineTimestamp(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type IterationGroup = {
  iterationIndex: number;
  executions: StepExecutionResponse[];
  isActive: boolean;
  isFailed: boolean;
};

export function groupExecutionsIntoIterations(stepExecutions: StepExecutionResponse[]): IterationGroup[] {
  if (stepExecutions.length === 0) return [];

  const sorted = stepExecutions.slice().sort((a, b) => {
    const tsA = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tsB = b.started_at ? new Date(b.started_at).getTime() : 0;
    return tsA - tsB;
  });

  const iterations: StepExecutionResponse[][] = [[]];
  let prevStepNumber = -1;

  for (const exec of sorted) {
    if (exec.step_number <= prevStepNumber && iterations[iterations.length - 1]!.length > 0) {
      iterations.push([]);
    }
    iterations[iterations.length - 1]!.push(exec);
    prevStepNumber = exec.step_number;
  }

  return iterations.map((executions, index) => {
    const sortedByStep = executions.slice().sort((a, b) => a.step_number - b.step_number);
    const hasActive = sortedByStep.some((e) => isRunActive(e.status));
    const hasFailed = sortedByStep.some((e) => isRunFailed(e.status));

    return {
      iterationIndex: index,
      executions: sortedByStep,
      isActive: hasActive,
      isFailed: !hasActive && hasFailed,
    };
  });
}

export function getTimelineDotClass(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "running" || normalized === "in_progress" || normalized === "queued") {
    return "bg-amber-500";
  }
  if (normalized === "failed" || normalized === "error") {
    return "bg-rose-500";
  }
  if (normalized === "completed" || normalized === "success" || normalized === "succeeded" || normalized === "done") {
    return "bg-emerald-500";
  }
  return "bg-slate-400";
}

export function toPhaseBadgeClass(phase: ClassifiedPipelineRun["phase"]) {
  if (phase === "discovery") return "border-teal-300 bg-teal-100 text-teal-900";
  if (phase === "creation") return "border-indigo-300 bg-indigo-100 text-indigo-900";
  if (phase === "mixed") return "border-amber-300 bg-amber-100 text-amber-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

export function toPhaseLabel(phase: ClassifiedPipelineRun["phase"]) {
  if (phase === "mixed") return "Mixed";
  if (phase === "unknown") return "Unknown";
  return phase === "discovery" ? "Discovery" : "Creation";
}

export function isAcceptedDecision(decision: string | null | undefined) {
  const normalized = String(decision ?? "").toLowerCase();
  return normalized.includes("accept") || normalized.includes("approved") || normalized.includes("selected");
}

export function isRejectedDecision(decision: string | null | undefined) {
  const normalized = String(decision ?? "").toLowerCase();
  return normalized.includes("reject") || normalized.includes("exclude") || normalized.includes("deny");
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
