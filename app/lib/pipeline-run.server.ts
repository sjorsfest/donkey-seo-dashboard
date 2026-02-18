import { ApiClient } from "~/lib/api.server";
import {
  classifyRunPhaseFromSteps,
  mergePhaseWithDiscoverySignals,
  sortClassifiedRunsNewest,
  type ClassifiedPipelineRun,
} from "~/lib/pipeline-phase";
import type { components } from "~/types/api.generated";

type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type DiscoveryTopicSnapshotResponse = components["schemas"]["DiscoveryTopicSnapshotResponse"];

export type JsonResult<T> = {
  unauthorized: boolean;
  ok: boolean;
  status: number;
  data: T | null;
};

export async function fetchJson<T>(api: ApiClient, path: string): Promise<JsonResult<T>> {
  const response = await api.fetch(path);

  if (response.status === 401) {
    return { unauthorized: true, ok: false, status: 401, data: null };
  }

  if (!response.ok) {
    return { unauthorized: false, ok: false, status: response.status, data: null };
  }

  return {
    unauthorized: false,
    ok: true,
    status: response.status,
    data: (await response.json()) as T,
  };
}

export async function classifyPipelineRuns(
  api: ApiClient,
  projectId: string,
  runs: PipelineRunResponse[]
): Promise<{ unauthorized: boolean; runs: ClassifiedPipelineRun[] }> {
  if (runs.length === 0) {
    return { unauthorized: false, runs: [] };
  }

  const snapshotChecks = await Promise.all(
    runs.map(async (run) =>
      fetchJson<DiscoveryTopicSnapshotResponse[]>(api, `/pipeline/${projectId}/runs/${run.id}/discovery-snapshots`)
    )
  );

  if (snapshotChecks.some((check) => check.unauthorized)) {
    return { unauthorized: true, runs: [] };
  }

  const enriched = runs.map((run, index) => {
    const snapshotCheck = snapshotChecks[index];
    const hasDiscoverySnapshots = Boolean(snapshotCheck?.ok && snapshotCheck.data && snapshotCheck.data.length > 0);
    const basePhase = classifyRunPhaseFromSteps(run.step_executions);
    const phase = mergePhaseWithDiscoverySignals(basePhase, hasDiscoverySnapshots);

    return {
      run,
      phase,
      hasDiscoverySnapshots,
    } satisfies ClassifiedPipelineRun;
  });

  return { unauthorized: false, runs: sortClassifiedRunsNewest(enriched) };
}

