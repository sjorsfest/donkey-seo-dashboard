import type { components } from "~/types/api.generated";

type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];

export type PipelineModule = "discovery" | "content" | "unknown";

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizePipelineModule(value: string | null | undefined): PipelineModule {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "discovery" || normalized === "content") {
    return normalized;
  }
  return "unknown";
}

export function formatPipelineModuleLabel(value: string | null | undefined) {
  const normalized = normalizePipelineModule(value);
  if (normalized === "discovery") return "Discovery";
  if (normalized === "content") return "Content";
  return "Unknown";
}

export function sortPipelineRunsNewest(runs: PipelineRunResponse[]) {
  return runs
    .slice()
    .sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at));
}

export function isRunInModule(run: PipelineRunResponse, target: "discovery" | "content") {
  return normalizePipelineModule(run.pipeline_module) === target;
}

export function filterRunsByModule(runs: PipelineRunResponse[], target: "discovery" | "content") {
  return sortPipelineRunsNewest(runs).filter((run) => isRunInModule(run, target));
}

export function pickLatestRunForModule(
  runs: PipelineRunResponse[],
  target: "discovery" | "content"
): PipelineRunResponse | null {
  return filterRunsByModule(runs, target)[0] ?? null;
}

export function groupContentRunsByParent(runs: PipelineRunResponse[]) {
  const grouped: Record<string, PipelineRunResponse[]> = {};
  const standalone: PipelineRunResponse[] = [];
  const contentRuns = filterRunsByModule(runs, "content");

  for (const run of contentRuns) {
    if (!run.parent_run_id) {
      standalone.push(run);
      continue;
    }

    if (!grouped[run.parent_run_id]) {
      grouped[run.parent_run_id] = [];
    }
    grouped[run.parent_run_id].push(run);
  }

  return { byParentRunId: grouped, standalone };
}
