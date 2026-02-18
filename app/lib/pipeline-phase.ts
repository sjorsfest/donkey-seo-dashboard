import type { components } from "~/types/api.generated";

type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type StepExecutionResponse = components["schemas"]["StepExecutionResponse"];

export type PipelinePhase = "discovery" | "creation" | "mixed" | "unknown";

export type ClassifiedPipelineRun = {
  run: PipelineRunResponse;
  phase: PipelinePhase;
  hasDiscoverySnapshots: boolean;
};

function hasToken(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

export function classifyRunPhaseFromSteps(steps: StepExecutionResponse[] | null | undefined): PipelinePhase {
  const safeSteps = steps ?? [];
  if (safeSteps.length === 0) return "unknown";

  let hasDiscovery = false;
  let hasCreation = false;

  for (const step of safeSteps) {
    const normalized = String(step.step_name ?? "").toLowerCase();

    if (hasToken(normalized, ["keyword", "topic", "cluster", "discover"])) {
      hasDiscovery = true;
    }

    if (hasToken(normalized, ["brief", "writer", "content", "outline"])) {
      hasCreation = true;
    }
  }

  if (hasDiscovery && hasCreation) return "mixed";
  if (hasDiscovery) return "discovery";
  if (hasCreation) return "creation";
  return "unknown";
}

export function mergePhaseWithDiscoverySignals(phase: PipelinePhase, hasDiscoverySnapshots: boolean): PipelinePhase {
  if (!hasDiscoverySnapshots) return phase;
  if (phase === "creation") return "mixed";
  if (phase === "unknown") return "discovery";
  return phase;
}

export function isPhaseMatch(phase: PipelinePhase, target: "discovery" | "creation") {
  return phase === target || phase === "mixed";
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortClassifiedRunsNewest(runs: ClassifiedPipelineRun[]) {
  return runs.slice().sort((a, b) => toTimestamp(b.run.created_at) - toTimestamp(a.run.created_at));
}

export function pickLatestRunForPhase(
  runs: ClassifiedPipelineRun[],
  target: "discovery" | "creation"
): ClassifiedPipelineRun | null {
  const sorted = sortClassifiedRunsNewest(runs);
  return sorted.find((entry) => isPhaseMatch(entry.phase, target)) ?? null;
}

