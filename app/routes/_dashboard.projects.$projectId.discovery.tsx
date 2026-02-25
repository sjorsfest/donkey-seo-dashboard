import { useEffect, useRef } from "react";
import { Link, Form, data, redirect, useActionData, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { Search, Layers, RefreshCw } from "lucide-react";
import type { Route } from "./+types/_dashboard.projects.$projectId.discovery";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import {
  calculateOverallProgress,
  formatDateTime,
  formatStepName,
  formatStatusLabel,
  getStatusBadgeClass,
  isAcceptedDecision,
  isRejectedDecision,
  isRunActive,
  isRunFailed,
  isRunPaused,
} from "~/lib/dashboard";
import {
  pickLatestRunForModule,
  sortPipelineRunsNewest,
} from "~/lib/pipeline-module";
import { fetchJson } from "~/lib/pipeline-run.server";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];
type KeywordListResponse = components["schemas"]["KeywordListResponse"];
type TopicListResponse = components["schemas"]["TopicListResponse"];
type TopicResponse = components["schemas"]["TopicResponse"];
type DiscoveryTopicSnapshotResponse = components["schemas"]["DiscoveryTopicSnapshotResponse"];

type SnapshotStats = {
  iterationCount: number;
  acceptedCount: number;
  rejectedCount: number;
  acceptanceRate: number;
};

type LoaderData = {
  project: ProjectResponse;
  latestRun: PipelineRunResponse | null;
  latestRunProgress: PipelineProgressResponse | null;
  keywordTotal: number;
  topicTotal: number;
  rankedTopicCount: number;
  snapshotStats: SnapshotStats;
};

type ActionData = {
  error?: string;
};

async function handleUnauthorized(api: ApiClient) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

function computeSnapshotStats(snapshots: DiscoveryTopicSnapshotResponse[]): SnapshotStats {
  if (snapshots.length === 0) {
    return { iterationCount: 0, acceptedCount: 0, rejectedCount: 0, acceptanceRate: 0 };
  }

  const iterations = new Set(snapshots.map((s) => s.iteration_index));
  const acceptedCount = snapshots.filter((s) => isAcceptedDecision(s.decision)).length;
  const rejectedCount = snapshots.filter((s) => isRejectedDecision(s.decision)).length;
  const acceptanceRate = Math.round((acceptedCount / snapshots.length) * 100);

  return {
    iterationCount: iterations.size,
    acceptedCount,
    rejectedCount,
    acceptanceRate,
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  if (!projectId) {
    throw new Response("Missing project id.", { status: 400 });
  }

  const api = new ApiClient(request);

  const projectResult = await fetchJson<ProjectResponse>(api, `/projects/${projectId}`);
  if (projectResult.unauthorized) return handleUnauthorized(api);
  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  const runsResult = await fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=12`);
  if (runsResult.unauthorized) return handleUnauthorized(api);

  const rawRuns = sortPipelineRunsNewest(runsResult.ok && runsResult.data ? runsResult.data : []);
  const preferred = pickLatestRunForModule(rawRuns, "discovery");

  const [keywordsResult, topicsResult, rankedTopicsResult] = await Promise.all([
    fetchJson<KeywordListResponse>(api, `/keywords/${projectId}?page=1&page_size=1`),
    fetchJson<TopicListResponse>(api, `/topics/${projectId}?page=1&page_size=1&eligibility=all`),
    fetchJson<TopicResponse[]>(api, `/topics/${projectId}/ranked?limit=30`),
  ]);

  if (keywordsResult.unauthorized || topicsResult.unauthorized || rankedTopicsResult.unauthorized) {
    return handleUnauthorized(api);
  }

  let latestRun: PipelineRunResponse | null = null;
  let latestRunProgress: PipelineProgressResponse | null = null;
  let snapshotStats: SnapshotStats = { iterationCount: 0, acceptedCount: 0, rejectedCount: 0, acceptanceRate: 0 };

  if (preferred) {
    const runResult = await fetchJson<PipelineRunResponse>(api, `/pipeline/${projectId}/runs/${preferred.id}`);
    if (runResult.unauthorized) return handleUnauthorized(api);
    if (runResult.ok && runResult.data) {
      latestRun = runResult.data;

      if (isRunActive(latestRun.status)) {
        const progressResult = await fetchJson<PipelineProgressResponse>(
          api,
          `/pipeline/${projectId}/runs/${preferred.id}/progress`
        );
        if (progressResult.unauthorized) return handleUnauthorized(api);
        if (progressResult.ok && progressResult.data) {
          latestRunProgress = progressResult.data;
        }
      }

      const snapshotsResult = await fetchJson<DiscoveryTopicSnapshotResponse[]>(
        api,
        `/pipeline/${projectId}/runs/${preferred.id}/discovery-snapshots`
      );
      if (snapshotsResult.unauthorized) return handleUnauthorized(api);
      if (snapshotsResult.ok && snapshotsResult.data) {
        snapshotStats = computeSnapshotStats(snapshotsResult.data);
      }
    }
  }

  return data(
    {
      project: projectResult.data,
      latestRun,
      latestRunProgress,
      keywordTotal: keywordsResult.ok && keywordsResult.data ? keywordsResult.data.total : 0,
      topicTotal: topicsResult.ok && topicsResult.data ? topicsResult.data.total : 0,
      rankedTopicCount: rankedTopicsResult.ok && rankedTopicsResult.data ? rankedTopicsResult.data.length : 0,
      snapshotStats,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const projectId = params.projectId;
  if (!projectId) {
    return data({ error: "Missing project id." } satisfies ActionData, { status: 400 });
  }

  const api = new ApiClient(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "startDiscovery" && intent !== "pausePipeline" && intent !== "resumePipeline") {
    return data({ error: "Unsupported action." } satisfies ActionData, { status: 400 });
  }

  if (intent === "startDiscovery") {
    const runsResult = await fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=12`);
    if (runsResult.unauthorized) return handleUnauthorized(api);
    if (!runsResult.ok || !runsResult.data) {
      return data(
        { error: "Unable to verify existing discovery run." } satisfies ActionData,
        { status: runsResult.status, headers: await api.commit() }
      );
    }

    const existingDiscoveryRun = pickLatestRunForModule(runsResult.data, "discovery");
    if (existingDiscoveryRun) {
      return redirect(`/projects/${projectId}/discovery/runs/${encodeURIComponent(existingDiscoveryRun.id)}`, {
        headers: await api.commit(),
      });
    }

    const payload: PipelineStartRequest = {
      mode: "discovery",
      start_step: 0,
      discovery: {
        max_iterations: 3,
        min_eligible_topics: null,
        require_serp_gate: true,
        max_keyword_difficulty: 65,
        min_domain_diversity: 0.5,
        require_intent_match: true,
        max_serp_servedness: 0.75,
        max_serp_competitor_density: 0.7,
        min_serp_intent_confidence: 0.35,
        auto_dispatch_content_tasks: true,
      },
    };

    const startResponse = await api.fetch(`/pipeline/${projectId}/start`, {
      method: "POST",
      json: payload,
    });

    if (startResponse.status === 401) return handleUnauthorized(api);

    if (!startResponse.ok) {
      const apiMessage = await readApiErrorMessage(startResponse);
      return data(
        {
          error:
            apiMessage ??
            (startResponse.status === 409
              ? "Discovery is already running for this project."
              : "Unable to start discovery run."),
        } satisfies ActionData,
        { status: startResponse.status, headers: await api.commit() }
      );
    }

    const run = (await startResponse.json()) as PipelineRunResponse;
    return redirect(`/projects/${projectId}/discovery/runs/${run.id}`, {
      headers: await api.commit(),
    });
  }

  if (intent === "pausePipeline") {
    const runId = String(formData.get("run_id") ?? "").trim();
    if (!runId) {
      return data({ error: "Missing run id." } satisfies ActionData, { status: 400 });
    }

    const response = await api.fetch(`/pipeline/${projectId}/runs/${runId}/pause`, {
      method: "POST",
    });

    if (response.status === 401) return handleUnauthorized(api);

    if (!response.ok) {
      const apiMessage = await readApiErrorMessage(response);
      return data(
        { error: apiMessage ?? "Unable to pause selected run." } satisfies ActionData,
        { status: response.status, headers: await api.commit() }
      );
    }

    return redirect(`/projects/${projectId}/discovery`, {
      headers: await api.commit(),
    });
  }

  const runId = String(formData.get("run_id") ?? "").trim();
  if (!runId) {
    return data({ error: "Missing run id." } satisfies ActionData, { status: 400 });
  }

  const resumeResponse = await api.fetch(`/pipeline/${projectId}/resume/${runId}`, {
    method: "POST",
  });

  if (resumeResponse.status === 401) return handleUnauthorized(api);

  if (!resumeResponse.ok) {
    const apiMessage = await readApiErrorMessage(resumeResponse);
    return data(
      {
        error:
          apiMessage ??
          (resumeResponse.status === 409
            ? "Discovery is already running for this project."
            : "Unable to resume pipeline."),
      } satisfies ActionData,
      { status: resumeResponse.status, headers: await api.commit() }
    );
  }

  return redirect(`/projects/${projectId}/discovery`, {
    headers: await api.commit(),
  });
}

const DISCOVERY_STEPS = [
  { number: 2, label: "Seeds" },
  { number: 3, label: "Expansion" },
  { number: 4, label: "Metrics" },
  { number: 5, label: "Intent" },
  { number: 6, label: "Clustering" },
  { number: 7, label: "Prioritization" },
  { number: 8, label: "SERP" },
] as const;

type StepExecution = components["schemas"]["StepExecutionResponse"];

const SUCCESS_STEP = new Set(["completed", "success", "succeeded", "done"]);

function getStepState(
  step: (typeof DISCOVERY_STEPS)[number],
  currentStepName: string | null,
  executions: StepExecution[],
  isActive: boolean,
): "completed" | "running" | "idle" {
  const exec = executions.find((e) => e.step_number === step.number);

  // Check if this step is currently running based on the step name
  if (isActive && currentStepName && step.label.toLowerCase() === currentStepName.toLowerCase()) {
    return "running";
  }

  // If the pipeline is active and we have a current step, mark steps after it as idle
  if (isActive && currentStepName) {
    const currentStepIndex = DISCOVERY_STEPS.findIndex(
      (s) => s.label.toLowerCase() === currentStepName.toLowerCase()
    );
    const thisStepIndex = DISCOVERY_STEPS.findIndex((s) => s.number === step.number);

    // If this step comes after the current running step, it should be idle (not yet reached in this iteration)
    if (currentStepIndex !== -1 && thisStepIndex > currentStepIndex) {
      return "idle";
    }
  }

  // Check if the step is completed
  if (exec && SUCCESS_STEP.has(exec.status.toLowerCase())) return "completed";

  return "idle";
}

function DiscoveryStepTimeline({
  currentStepName,
  steps,
  isActive,
}: {
  currentStepName: string | null;
  steps: StepExecution[];
  isActive: boolean;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center">
        {DISCOVERY_STEPS.map((step, i) => {
          const state = getStepState(step, currentStepName, steps, isActive);
          return (
            <div key={step.number} className="flex items-center" style={{ flex: i < DISCOVERY_STEPS.length - 1 ? 1 : undefined }}>
              {/* Node */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`relative flex h-3 w-3 items-center justify-center rounded-full transition-colors ${
                    state === "completed"
                      ? "bg-emerald-500"
                      : state === "running"
                        ? "bg-amber-400"
                        : "bg-slate-200"
                  }`}
                >
                  {state === "running" && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-50" />
                  )}
                </div>
                <span
                  className={`text-[10px] leading-none whitespace-nowrap ${
                    state === "completed"
                      ? "font-medium text-emerald-700"
                      : state === "running"
                        ? "font-semibold text-amber-700"
                        : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {i < DISCOVERY_STEPS.length - 1 && (
                <div
                  className={`mx-1 h-[2px] flex-1 rounded-full transition-colors ${
                    state === "completed" ? "bg-emerald-300" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjectDiscoveryHubRoute() {
  const {
    project,
    latestRun,
    latestRunProgress,
    keywordTotal,
    topicTotal,
    rankedTopicCount,
    snapshotStats,
  } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const revalidator = useRevalidator();

  const progressFetcher = useFetcher<PipelineProgressResponse>();
  const isProgressRequestInFlightRef = useRef(false);

  const liveProgress = progressFetcher.data ?? latestRunProgress;
  const effectiveStatus = liveProgress?.status ?? latestRun?.status ?? null;

  useEffect(() => {
    isProgressRequestInFlightRef.current = progressFetcher.state !== "idle";
  }, [progressFetcher.state]);

  useEffect(() => {
    if (!latestRun?.id) return;
    if (!isRunActive(effectiveStatus)) return;

    const poll = () => {
      if (isProgressRequestInFlightRef.current) return;
      isProgressRequestInFlightRef.current = true;
      progressFetcher.load(`/projects/${project.id}/progress/${latestRun.id}?ts=${Date.now()}`);
    };

    poll();
    const interval = window.setInterval(poll, 5000);

    return () => {
      window.clearInterval(interval);
      isProgressRequestInFlightRef.current = false;
    };
  }, [project.id, latestRun?.id, effectiveStatus]);

  const overallProgress = Math.round(
    liveProgress?.overall_progress ?? calculateOverallProgress(liveProgress?.steps ?? latestRun?.step_executions ?? [])
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0f6f5] to-[#ecf2fb] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Discovery</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Keyword discovery, topic clustering, and loop iteration management.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/projects/${project.id}/creation`}>
              <Button variant="outline">Creation phase</Button>
            </Link>
            <Link to="/project">
              <Button variant="outline">Back to project</Button>
            </Link>
            <Button variant="secondary" onClick={() => revalidator.revalidate()}>
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {actionData?.error ? (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {actionData.error}
        </p>
      ) : null}

      {latestRun ? (
        <Card className="border-[#2f6f71]/30 bg-gradient-to-r from-teal-50/60 to-white">
          <CardContent className="pt-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold text-slate-900">Run {latestRun.id.slice(0, 8)}</p>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(effectiveStatus)}`}
                  >
                    {formatStatusLabel(effectiveStatus)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <p>
                    Current step:{" "}
                    {liveProgress?.current_step_name ?? "N/A"}
                  </p>
                  <p>Started: {formatDateTime(latestRun.started_at ?? latestRun.created_at)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Form method="post">
                  <input type="hidden" name="intent" value="pausePipeline" />
                  <input type="hidden" name="run_id" value={latestRun.id} />
                  <Button type="submit" variant="outline" disabled={!isRunActive(effectiveStatus)}>
                    Pause
                  </Button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="resumePipeline" />
                  <input type="hidden" name="run_id" value={latestRun.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!isRunPaused(effectiveStatus) && !isRunFailed(effectiveStatus)}
                  >
                    Resume
                  </Button>
                </Form>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              <Progress value={overallProgress} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <p>{overallProgress}% · {formatStepName(liveProgress?.current_step_name)}</p>
                <p>{formatDateTime(latestRun.started_at ?? latestRun.created_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Start a discovery loop to begin iterative keyword analysis, clustering, and topic decisions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <input type="hidden" name="intent" value="startDiscovery" />
              <Button type="submit">Start discovery loop</Button>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          to={`/projects/${project.id}/discovery/keywords`}
          className="group block rounded-2xl border-2 border-black border-l-4 border-l-teal-500 bg-white shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a]"
        >
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-900">Keywords</p>
              </div>
            </div>
            <p className="mt-3 font-display text-3xl font-bold text-slate-900">{keywordTotal}</p>
            <p className="text-sm text-slate-500">total keywords discovered</p>
            <p className="mt-2 text-xs text-teal-700 group-hover:underline">Explore keywords &rarr;</p>
          </div>
        </Link>

        <Link
          to={`/projects/${project.id}/discovery/topics`}
          className="group block rounded-2xl border-2 border-black border-l-4 border-l-indigo-500 bg-white shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a]"
        >
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-900">Topics</p>
              </div>
            </div>
            <p className="mt-3 font-display text-3xl font-bold text-slate-900">{topicTotal}</p>
            <p className="text-sm text-slate-500">topic clusters identified</p>
            <p className="mt-1 text-xs text-slate-400">{rankedTopicCount} ranked</p>
            <p className="mt-2 text-xs text-indigo-700 group-hover:underline">Explore topics &rarr;</p>
          </div>
        </Link>

        {latestRun ? (
          <Link
            to={`/projects/${project.id}/discovery/runs/${latestRun.id}`}
            className="group block rounded-2xl border-2 border-black border-l-4 border-l-amber-500 bg-white shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a]"
          >
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-slate-900">Discovery Loop</p>
                </div>
              </div>
              <p className="mt-3 font-display text-3xl font-bold text-slate-900">{snapshotStats.iterationCount}</p>
              <p className="text-sm text-slate-500">
                {snapshotStats.iterationCount === 1 ? "iteration" : "iterations"} completed
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {snapshotStats.acceptanceRate}% acceptance rate
              </p>
              <p className="mt-2 text-xs text-amber-700 group-hover:underline">View run details &rarr;</p>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-400">Discovery Loop</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-400">No runs yet. Start a discovery loop above.</p>
          </div>
        )}
      </div>

      {latestRun ? (
        <Card className="border-slate-200 bg-white">
          <CardContent className="pt-5">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Discovery Pipeline Progress</p>
              <DiscoveryStepTimeline
                currentStepName={liveProgress?.current_step_name ?? null}
                steps={liveProgress?.steps ?? latestRun?.step_executions ?? []}
                isActive={isRunActive(effectiveStatus)}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
