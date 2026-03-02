import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { useOnboarding } from "~/components/onboarding/onboarding-context";
import { OnboardingOverlay } from "~/components/onboarding/onboarding-overlay";
import { DonkeyBubble } from "~/components/onboarding/donkey-bubble";
import { RefreshCw } from "lucide-react";
import type { Route } from "./+types/_dashboard.projects.$projectId.discovery.runs.$runId";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import {
  formatArticleLimitReachedMessage,
  isArticleLimitReached,
  isFreeTierUsage,
} from "~/lib/billing-usage";
import {
  calculateOverallProgress,
  formatDateTime,
  formatStatusLabel,
  formatStepItems,
  formatStepName,
  formatTimelineTimestamp,
  getStatusBadgeClass,
  getTimelineDotClass,
  groupExecutionsIntoIterations,
  isAcceptedDecision,
  isRejectedDecision,
  isRunActive,
  isRunFailed,
  isRunPaused,
  type IterationGroup,
} from "~/lib/dashboard";
import { isRunInModule, pickLatestRunForModule, sortPipelineRunsNewest } from "~/lib/pipeline-module";
import { fetchJson } from "~/lib/pipeline-run.server";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];
type StepExecutionResponse = components["schemas"]["StepExecutionResponse"];
type DiscoveryTopicSnapshotResponse = components["schemas"]["DiscoveryTopicSnapshotResponse"];
type BillingUsageResponse = components["schemas"]["BillingUsageResponse"];

type IterationSnapshotStats = { accepted: number; rejected: number; total: number };

type LoaderData = {
  project: ProjectResponse;
  selectedRun: PipelineRunResponse;
  progress: PipelineProgressResponse | null;
  stepFocus: number | null;
  snapshotsByIteration: Record<number, IterationSnapshotStats>;
  usage: BillingUsageResponse | null;
};

type ActionData = {
  error?: string;
};

const STEP_FOCUS_PATTERN = /\/steps\/([^/]+)$/;

function parseStepFocusFromPathname(pathname: string) {
  const match = pathname.match(STEP_FOCUS_PATTERN);
  if (!match) return { hasStepPath: false, stepFocus: null as number | null };

  const parsed = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return { hasStepPath: true, stepFocus: null as number | null };
  }

  return { hasStepPath: true, stepFocus: parsed };
}

async function handleUnauthorized(api: ApiClient) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

function buildSnapshotsByIteration(snapshots: DiscoveryTopicSnapshotResponse[]): Record<number, IterationSnapshotStats> {
  const result: Record<number, IterationSnapshotStats> = {};
  for (const snapshot of snapshots) {
    const idx = snapshot.iteration_index;
    if (!result[idx]) {
      result[idx] = { accepted: 0, rejected: 0, total: 0 };
    }
    result[idx].total += 1;
    if (isAcceptedDecision(snapshot.decision)) result[idx].accepted += 1;
    if (isRejectedDecision(snapshot.decision)) result[idx].rejected += 1;
  }
  return result;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  const runId = params.runId;

  if (!projectId || !runId) {
    throw new Response("Missing route parameters.", { status: 400 });
  }

  const url = new URL(request.url);
  const stepFocusParsed = parseStepFocusFromPathname(url.pathname);
  if (stepFocusParsed.hasStepPath && stepFocusParsed.stepFocus === null) {
    throw new Response("Invalid step number.", { status: 400 });
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
  const requestedRun = rawRuns.find((entry) => entry.id === runId) ?? null;
  const preferredDiscoveryRun = pickLatestRunForModule(rawRuns, "discovery");

  if (requestedRun && isRunInModule(requestedRun, "content")) {
    return redirect(`/projects/${projectId}/creation/runs/${requestedRun.id}`, {
      headers: await api.commit(),
    });
  }

  if (!preferredDiscoveryRun) {
    throw new Response("Pipeline run not found.", { status: 404 });
  }

  if (runId !== preferredDiscoveryRun.id) {
    const canonicalPathname = url.pathname.replace(
      /\/discovery\/runs\/[^/]+/,
      `/discovery/runs/${encodeURIComponent(preferredDiscoveryRun.id)}`
    );
    return redirect(`${canonicalPathname}${url.search}`, {
      headers: await api.commit(),
    });
  }

  const selectedRunId = preferredDiscoveryRun.id;
  const [selectedRunResult, snapshotsResult, usageResult] = await Promise.all([
    fetchJson<PipelineRunResponse>(api, `/pipeline/${projectId}/runs/${selectedRunId}`),
    fetchJson<DiscoveryTopicSnapshotResponse[]>(api, `/pipeline/${projectId}/runs/${selectedRunId}/discovery-snapshots`),
    fetchJson<BillingUsageResponse>(api, "/billing/usage"),
  ]);
  if (selectedRunResult.unauthorized) return handleUnauthorized(api);
  if (snapshotsResult.unauthorized) return handleUnauthorized(api);
  if (usageResult.unauthorized) return handleUnauthorized(api);

  if (!selectedRunResult.ok || !selectedRunResult.data) {
    throw new Response("Failed to load selected run.", { status: selectedRunResult.status });
  }

  const selectedRun = selectedRunResult.data;
  if (!isRunInModule(selectedRun, "discovery")) {
    if (isRunInModule(selectedRun, "content")) {
      return redirect(`/projects/${projectId}/creation/runs/${selectedRun.id}`, {
        headers: await api.commit(),
      });
    }

    throw new Response("Run is not a discovery-module run.", { status: 409 });
  }
  const snapshotsByIteration = snapshotsResult.ok && snapshotsResult.data
    ? buildSnapshotsByIteration(snapshotsResult.data)
    : {};

  let progress: PipelineProgressResponse | null = null;
  if (isRunActive(selectedRun.status)) {
    const progressResult = await fetchJson<PipelineProgressResponse>(
      api,
      `/pipeline/${projectId}/runs/${selectedRunId}/progress`
    );
    if (progressResult.unauthorized) return handleUnauthorized(api);
    if (progressResult.ok && progressResult.data) {
      progress = progressResult.data;
    }
  }

  const effectiveSteps = (progress?.steps ?? selectedRun.step_executions ?? []) as StepExecutionResponse[];
  if (stepFocusParsed.stepFocus !== null && !effectiveSteps.some((step) => step.step_number === stepFocusParsed.stepFocus)) {
    throw new Response("Requested step was not found in this run.", { status: 404 });
  }

  return data(
    {
      project: projectResult.data,
      selectedRun,
      progress,
      stepFocus: stepFocusParsed.stepFocus,
      snapshotsByIteration,
      usage: usageResult.ok && usageResult.data ? usageResult.data : null,
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

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const api = new ApiClient(request);

  if (intent !== "pausePipeline" && intent !== "resumePipeline") {
    return data({ error: "Unsupported action." } satisfies ActionData, { status: 400 });
  }

  const runsResult = await fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=12`);
  if (runsResult.unauthorized) return handleUnauthorized(api);
  if (!runsResult.ok || !runsResult.data) {
    return data(
      { error: "Unable to verify discovery run state." } satisfies ActionData,
      { status: runsResult.status, headers: await api.commit() }
    );
  }

  const preferredDiscoveryRun = pickLatestRunForModule(runsResult.data, "discovery");
  if (!preferredDiscoveryRun) {
    return data({ error: "Discovery run not found." } satisfies ActionData, {
      status: 404,
      headers: await api.commit(),
    });
  }

  const requestUrl = new URL(request.url);
  const canonicalPathname = requestUrl.pathname.replace(
    /\/discovery\/runs\/[^/]+/,
    `/discovery/runs/${encodeURIComponent(preferredDiscoveryRun.id)}`
  );
  const canonicalUrl = `${canonicalPathname}${requestUrl.search}`;
  const runId = preferredDiscoveryRun.id;

  if (intent === "pausePipeline") {
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

    return redirect(canonicalUrl, {
      headers: await api.commit(),
    });
  }

  const usageResult = await fetchJson<BillingUsageResponse>(api, "/billing/usage");
  if (usageResult.unauthorized) return handleUnauthorized(api);
  if (usageResult.ok && usageResult.data && isArticleLimitReached(usageResult.data)) {
    return data(
      { error: formatArticleLimitReachedMessage(usageResult.data) } satisfies ActionData,
      { status: 409, headers: await api.commit() }
    );
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

  return redirect(canonicalUrl, {
    headers: await api.commit(),
  });
}

function ActiveStepCard({
  execution,
  stepFocus,
}: {
  execution: StepExecutionResponse;
  stepFocus: number | null;
}) {
  return (
    <Card
      className={cn(
        "border-[#2f6f71]/35 bg-slate-50/80 shadow-[0_20px_40px_-28px_rgba(47,111,113,0.85)]",
        stepFocus === execution.step_number && "ring-2 ring-[#2f6f71]/40"
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#2f6f71]">Current step</p>
            <CardTitle>{formatStepName(execution.step_name)}</CardTitle>
            <CardDescription>
              Step {execution.step_number} · {formatStepItems(execution)}
            </CardDescription>
          </div>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(execution.status)}`}
          >
            {formatStatusLabel(execution.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Progress value={execution.progress_percent} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>
            {execution.progress_percent}% · {execution.progress_message ?? "No message"}
          </p>
          <p>
            {formatDateTime(execution.started_at)}
            {execution.completed_at ? ` -> ${formatDateTime(execution.completed_at)}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StepTimelineItem({
  execution,
  stepFocus,
  isFirstItem,
  isLastItem,
  animationIndex,
  runId,
  projectId,
}: {
  execution: StepExecutionResponse;
  stepFocus: number | null;
  isFirstItem: boolean;
  isLastItem: boolean;
  animationIndex: number;
  runId: string;
  projectId: string;
}) {
  const isFocused = stepFocus === execution.step_number;

  return (
    <motion.div
      key={execution.step_number}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: animationIndex * 0.03 }}
      className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 md:grid-cols-[170px_24px_minmax(0,1fr)] md:gap-4"
    >
      <div className="hidden pt-1 text-right md:block">
        <p className="text-[11px] font-semibold text-slate-700">{formatTimelineTimestamp(execution.started_at)}</p>
        <p className="text-[10px] uppercase tracking-wide text-slate-400">Started</p>
      </div>

      <div className="relative col-start-1 row-span-1 flex justify-center md:col-start-2">
        {!isFirstItem ? <span className="absolute -top-4 bottom-1/2 w-px bg-slate-200" /> : null}
        {!isLastItem ? <span className="absolute top-3 -bottom-4 w-px bg-slate-200" /> : null}
        <span
          className={cn(
            "relative mt-2 inline-flex h-2.5 w-2.5 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(148,163,184,0.18)]",
            getTimelineDotClass(execution.status)
          )}
        />
      </div>

      <Link
        to={`/projects/${projectId}/discovery/runs/${runId}/steps/${execution.step_number}`}
        className={cn(
          "col-start-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_12px_30px_-16px_rgba(15,23,42,0.45)] md:col-start-3",
          isFocused && "ring-2 ring-[#2f6f71]/35"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step {execution.step_number}</p>
            <p className="truncate font-semibold text-slate-900">{formatStepName(execution.step_name)}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500 md:hidden">
              Started {formatDateTime(execution.started_at)}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(execution.status)}`}
          >
            {formatStatusLabel(execution.status)}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function LoopConnector({ iterationNumber }: { iterationNumber: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
        <RefreshCw className="h-3.5 w-3.5" />
        <span>Loop iteration {iterationNumber}</span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
    </div>
  );
}

function IterationSection({
  iteration,
  isCurrentIteration,
  defaultOpen,
  stepFocus,
  runId,
  projectId,
  snapshotStats,
}: {
  iteration: IterationGroup;
  isCurrentIteration: boolean;
  defaultOpen: boolean;
  stepFocus: number | null;
  runId: string;
  projectId: string;
  snapshotStats: IterationSnapshotStats | undefined;
}) {
  const activeExecution = iteration.executions.find((e) => isRunActive(e.status));
  const failedExecution = !activeExecution
    ? iteration.executions.slice().reverse().find((e) => isRunFailed(e.status))
    : undefined;
  const highlightedExecution = activeExecution ?? failedExecution ?? null;
  const otherExecutions = iteration.executions.filter((e) => e.id !== highlightedExecution?.id);

  const completedCount = iteration.executions.filter(
    (e) => !isRunActive(e.status) && !isRunFailed(e.status)
  ).length;

  const iterationLabel = `Iteration ${iteration.iterationIndex + 1}`;
  const summaryParts: string[] = [`${completedCount}/${iteration.executions.length} steps completed`];
  if (snapshotStats && snapshotStats.total > 0) {
    summaryParts.push(`${snapshotStats.accepted} accepted, ${snapshotStats.rejected} rejected`);
  }

  const statusLabel = isCurrentIteration
    ? iteration.isActive
      ? "Running"
      : iteration.isFailed
        ? "Failed"
        : "Current"
    : "Completed";

  const statusClass = isCurrentIteration
    ? iteration.isActive
      ? "border-amber-300 bg-amber-100 text-amber-900"
      : iteration.isFailed
        ? "border-rose-300 bg-rose-100 text-rose-900"
        : "border-emerald-300 bg-emerald-100 text-emerald-900"
    : "border-slate-300 bg-slate-100 text-slate-700";

  return (
    <details open={defaultOpen}>
      <summary className="cursor-pointer list-none rounded-xl border border-slate-200 bg-white px-4 py-3 marker:content-[''] hover:border-slate-300">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="font-display text-sm font-bold text-slate-900">{iterationLabel}</p>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500">{summaryParts.join(" · ")}</p>
        </div>
      </summary>

      <div className="mt-3 space-y-3 pl-2">
        {isCurrentIteration && highlightedExecution ? (
          <ActiveStepCard execution={highlightedExecution} stepFocus={stepFocus} />
        ) : null}

        {otherExecutions.map((execution, index) => (
          <StepTimelineItem
            key={execution.id}
            execution={execution}
            stepFocus={stepFocus}
            isFirstItem={index === 0}
            isLastItem={index === otherExecutions.length - 1}
            animationIndex={index}
            runId={runId}
            projectId={projectId}
          />
        ))}
      </div>
    </details>
  );
}

export default function ProjectDiscoveryRunRoute() {
  const {
    project,
    selectedRun,
    progress,
    stepFocus,
    snapshotsByIteration,
    usage,
  } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const revalidator = useRevalidator();
  const [searchParams] = useSearchParams();
  const onboarding = useOnboarding();

  const isNewlyCreated = searchParams.get("created") === "1";

  // Advance onboarding when arriving from project creation
  useEffect(() => {
    if (isNewlyCreated && onboarding.isPhase("setup_progress")) {
      onboarding.advance({ runId: selectedRun.id });
    }
  }, [isNewlyCreated]);

  const progressFetcher = useFetcher<PipelineProgressResponse>();
  const isProgressRequestInFlightRef = useRef(false);

  const liveProgress = progressFetcher.data ?? progress;
  const effectiveStatus = liveProgress?.status ?? selectedRun.status;
  const stepExecutions = (liveProgress?.steps ?? selectedRun.step_executions ?? []) as StepExecutionResponse[];
  const isAtArticleLimit = isArticleLimitReached(usage);
  const isFreeTier = isFreeTierUsage(usage);
  const showUpgradeOnly = isAtArticleLimit && isFreeTier;
  const articleLimitMessage = isAtArticleLimit ? formatArticleLimitReachedMessage(usage) : null;

  useEffect(() => {
    isProgressRequestInFlightRef.current = progressFetcher.state !== "idle";
  }, [progressFetcher.state]);

  useEffect(() => {
    if (!selectedRun.id) return;
    if (!isRunActive(effectiveStatus)) return;

    const poll = () => {
      if (isProgressRequestInFlightRef.current) return;
      isProgressRequestInFlightRef.current = true;
      progressFetcher.load(`/projects/${project.id}/progress/${selectedRun.id}?ts=${Date.now()}`);
    };

    poll();
    const interval = window.setInterval(poll, 5000);

    return () => {
      window.clearInterval(interval);
      isProgressRequestInFlightRef.current = false;
    };
  }, [project.id, selectedRun.id, effectiveStatus]);

  const iterations = useMemo(
    () => groupExecutionsIntoIterations(stepExecutions),
    [stepExecutions]
  );

  const isMultiIteration = iterations.length > 1;
  const currentIterationIndex = iterations.length > 0 ? iterations.length - 1 : 0;

  const activeStepExecution = useMemo(() => {
    if (stepExecutions.length === 0) return null;

    if (typeof stepFocus === "number") {
      const focused = stepExecutions.find((e) => e.step_number === stepFocus);
      if (focused) return focused;
    }

    const active = stepExecutions.find((e) => isRunActive(e.status));
    if (active) return active;

    const failed = stepExecutions.slice().reverse().find((e) => isRunFailed(e.status));
    if (failed) return failed;

    return stepExecutions[stepExecutions.length - 1] ?? null;
  }, [stepFocus, stepExecutions]);

  const overallProgress = Math.round(liveProgress?.overall_progress ?? calculateOverallProgress(stepExecutions));

  // For single-iteration: build the flat step list (same layout as before)
  const singleIterationSteps = useMemo(() => {
    if (isMultiIteration || iterations.length === 0) return [];
    return iterations[0]!.executions;
  }, [isMultiIteration, iterations]);

  const singleIterationOtherSteps = singleIterationSteps.filter(
    (e) => e.id !== activeStepExecution?.id
  );

  // Determine which iteration a focused step belongs to (for expanding the right section)
  const focusedIterationIndex = useMemo(() => {
    if (stepFocus === null) return null;
    const idx = iterations.findIndex((iter) =>
      iter.executions.some((e) => e.step_number === stepFocus)
    );
    return idx >= 0 ? idx : null;
  }, [stepFocus, iterations]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0f6f5] to-[#ecf2fb] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Run {selectedRun.id.slice(0, 8)}</p>
              <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            </div>
            <span
              className={`inline-flex self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(effectiveStatus)}`}
            >
              {formatStatusLabel(effectiveStatus)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {showUpgradeOnly ? (
              <Link to="/billing">
                <Button>Upgrade</Button>
              </Link>
            ) : (
              <>
                <Form method="post">
                  <input type="hidden" name="intent" value="pausePipeline" />
                  <input type="hidden" name="run_id" value={selectedRun.id} />
                  <Button type="submit" variant="outline" disabled={!isRunActive(effectiveStatus)}>
                    Pause
                  </Button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="resumePipeline" />
                  <input type="hidden" name="run_id" value={selectedRun.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={(!isRunPaused(effectiveStatus) && !isRunFailed(effectiveStatus)) || isAtArticleLimit}
                  >
                    Resume
                  </Button>
                </Form>
              </>
            )}
            <Link to={`/projects/${project.id}/discovery`}>
              <Button variant="outline">Back to overview</Button>
            </Link>
            <Button variant="secondary" onClick={() => revalidator.revalidate()}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <Progress value={overallProgress} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <p>{overallProgress}% · {formatStepName(liveProgress?.current_step_name ?? activeStepExecution?.step_name ?? "Not started")}</p>
            <p>Started {formatDateTime(selectedRun.started_at ?? selectedRun.created_at)}</p>
          </div>
        </div>
      </section>

      {actionData?.error ? (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {actionData.error}
        </p>
      ) : null}
      {articleLimitMessage ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {articleLimitMessage}
        </p>
      ) : null}

      {stepFocus !== null ? (
        <div className="flex items-center gap-2">
          <Link to={`/projects/${project.id}/discovery/runs/${selectedRun.id}`}>
            <Button variant="outline">Clear step focus</Button>
          </Link>
          <p className="text-xs text-slate-500">Viewing step {stepFocus}</p>
        </div>
      ) : null}

      {isMultiIteration ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Discovery Loop · Iteration {currentIterationIndex + 1} of {iterations.length}
            </p>
            <p className="text-xs text-slate-500">
              Pipeline is iterating to find more qualifying topics
            </p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Step timeline</CardTitle>
          <CardDescription>
            {isMultiIteration
              ? "Loop progress across iterations."
              : "Loop progress by execution step."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stepExecutions.length === 0 ? (
            <p className="text-sm text-slate-500">No step executions recorded yet.</p>
          ) : isMultiIteration ? (
            <div className="space-y-3">
              {iterations.map((iteration, index) => {
                const isCurrent = index === currentIterationIndex;
                const shouldOpen =
                  focusedIterationIndex === index ||
                  (focusedIterationIndex === null && isCurrent);

                return (
                  <div key={iteration.iterationIndex}>
                    {index > 0 ? (
                      <LoopConnector iterationNumber={index + 1} />
                    ) : null}
                    <IterationSection
                      iteration={iteration}
                      isCurrentIteration={isCurrent}
                      defaultOpen={shouldOpen}
                      stepFocus={stepFocus}
                      runId={selectedRun.id}
                      projectId={project.id}
                      snapshotStats={snapshotsByIteration[iteration.iterationIndex]}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {activeStepExecution ? (
                <ActiveStepCard execution={activeStepExecution} stepFocus={stepFocus} />
              ) : null}

              {singleIterationOtherSteps.map((execution, index) => (
                <StepTimelineItem
                  key={execution.id}
                  execution={execution}
                  stepFocus={stepFocus}
                  isFirstItem={index === 0}
                  isLastItem={index === singleIterationOtherSteps.length - 1}
                  animationIndex={index}
                  runId={selectedRun.id}
                  projectId={project.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {onboarding.isPhase("congratulations") && (
        <OnboardingOverlay
          onNext={() => onboarding.advance()}
          nextLabel="Show me around!"
        >
          <DonkeyBubble>
            <p className="font-display text-lg font-bold text-slate-900">Congratulations!</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              You've set up your automated SEO content pipeline. Your first topic discovery run is
              now underway. Let me show you around the dashboard!
            </p>
          </DonkeyBubble>
        </OnboardingOverlay>
      )}
    </div>
  );
}
