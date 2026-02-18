import { useEffect, useMemo, useRef, useState } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRevalidator,
} from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId.creation.runs.$runId";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Select } from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ApiClient } from "~/lib/api.server";
import {
  formatDateTime,
  formatStatusLabel,
  getStatusBadgeClass,
  isRunActive,
  isRunFailed,
  isRunPaused,
  summarizeSteps,
} from "~/lib/dashboard";
import { classifyPipelineRuns, fetchJson } from "~/lib/pipeline-run.server";
import { isPhaseMatch, pickLatestRunForPhase, type ClassifiedPipelineRun } from "~/lib/pipeline-phase";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];
type StepExecutionResponse = components["schemas"]["StepExecutionResponse"];
type ContentBriefListResponse = components["schemas"]["ContentBriefListResponse"];
type ContentBriefResponse = components["schemas"]["ContentBriefResponse"];
type ContentBriefDetailResponse = components["schemas"]["ContentBriefDetailResponse"];
type WriterInstructionsResponse = components["schemas"]["WriterInstructionsResponse"];
type TopicResponse = components["schemas"]["TopicResponse"];

type LoaderData = {
  project: ProjectResponse;
  runs: ClassifiedPipelineRun[];
  selectedRun: PipelineRunResponse;
  progress: PipelineProgressResponse | null;
  briefs: ContentBriefResponse[];
  selectedBriefId: string | null;
  selectedBrief: ContentBriefDetailResponse | null;
  selectedBriefInstructions: WriterInstructionsResponse | null;
  rankedTopics: TopicResponse[];
};

type ActionData = {
  error?: string;
};

const BRIEF_PATH_PATTERN = /\/briefs\/([^/]+)$/;

function parseBriefFromPathname(pathname: string) {
  const match = pathname.match(BRIEF_PATH_PATTERN);
  if (!match) return { hasBriefPath: false, briefId: null as string | null };

  const raw = match[1] ?? "";
  const decoded = decodeURIComponent(raw).trim();
  if (!decoded) return { hasBriefPath: true, briefId: null as string | null };

  return { hasBriefPath: true, briefId: decoded };
}

function toPhaseBadgeClass(phase: ClassifiedPipelineRun["phase"]) {
  if (phase === "discovery") return "border-teal-300 bg-teal-100 text-teal-900";
  if (phase === "creation") return "border-indigo-300 bg-indigo-100 text-indigo-900";
  if (phase === "mixed") return "border-amber-300 bg-amber-100 text-amber-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function toPhaseLabel(phase: ClassifiedPipelineRun["phase"]) {
  if (phase === "mixed") return "Mixed";
  if (phase === "unknown") return "Unknown";
  return phase === "discovery" ? "Discovery" : "Creation";
}

function formatStepName(value: string | null | undefined) {
  if (!value) return "Unnamed Step";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function calculateOverallProgress(steps: StepExecutionResponse[]) {
  if (steps.length === 0) return 0;
  const total = steps.reduce((acc, step) => acc + step.progress_percent, 0);
  return Math.round(total / steps.length);
}

async function handleUnauthorized(api: ApiClient) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  const runId = params.runId;

  if (!projectId || !runId) {
    throw new Response("Missing route parameters.", { status: 400 });
  }

  const url = new URL(request.url);
  const briefFromPath = parseBriefFromPathname(url.pathname);
  if (briefFromPath.hasBriefPath && briefFromPath.briefId === null) {
    throw new Response("Invalid brief id.", { status: 400 });
  }

  const api = new ApiClient(request);

  const projectResult = await fetchJson<ProjectResponse>(api, `/projects/${projectId}`);
  if (projectResult.unauthorized) return handleUnauthorized(api);
  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  const runsResult = await fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=12`);
  if (runsResult.unauthorized) return handleUnauthorized(api);

  const rawRuns = runsResult.ok && runsResult.data ? runsResult.data : [];
  const classified = await classifyPipelineRuns(api, projectId, rawRuns);
  if (classified.unauthorized) return handleUnauthorized(api);

  const selectedRunSummary = classified.runs.find((entry) => entry.run.id === runId) ?? null;
  if (!selectedRunSummary) {
    const preferred = pickLatestRunForPhase(classified.runs, "creation");
    if (preferred) {
      return redirect(`/projects/${projectId}/creation/runs/${preferred.run.id}`, {
        headers: await api.commit(),
      });
    }

    throw new Response("Pipeline run not found.", { status: 404 });
  }

  if (!isPhaseMatch(selectedRunSummary.phase, "creation")) {
    const preferred = pickLatestRunForPhase(classified.runs, "creation");
    if (preferred && preferred.run.id !== selectedRunSummary.run.id) {
      return redirect(`/projects/${projectId}/creation/runs/${preferred.run.id}`, {
        headers: await api.commit(),
      });
    }
  }

  const [selectedRunResult, briefsResult, rankedTopicsResult] = await Promise.all([
    fetchJson<PipelineRunResponse>(api, `/pipeline/${projectId}/runs/${runId}`),
    fetchJson<ContentBriefListResponse>(api, `/content/${projectId}/briefs?page=1&page_size=100`),
    fetchJson<TopicResponse[]>(api, `/topics/${projectId}/ranked?limit=20`),
  ]);

  if ([selectedRunResult, briefsResult, rankedTopicsResult].some((result) => result.unauthorized)) {
    return handleUnauthorized(api);
  }

  if (!selectedRunResult.ok || !selectedRunResult.data) {
    throw new Response("Failed to load selected run.", { status: selectedRunResult.status });
  }

  const selectedRun = selectedRunResult.data;

  let progress: PipelineProgressResponse | null = null;
  if (isRunActive(selectedRun.status)) {
    const progressResult = await fetchJson<PipelineProgressResponse>(api, `/pipeline/${projectId}/runs/${runId}/progress`);
    if (progressResult.unauthorized) return handleUnauthorized(api);
    if (progressResult.ok && progressResult.data) {
      progress = progressResult.data;
    }
  }

  const briefs = briefsResult.ok && briefsResult.data ? briefsResult.data.items ?? [] : [];
  const requestedBriefId = briefFromPath.briefId;

  if (briefFromPath.hasBriefPath && requestedBriefId) {
    const matching = briefs.find((brief) => brief.id === requestedBriefId) ?? null;
    if (!matching) {
      if (briefs.length > 0) {
        return redirect(`/projects/${projectId}/creation/runs/${runId}/briefs/${briefs[0].id}`, {
          headers: await api.commit(),
        });
      }

      return redirect(`/projects/${projectId}/creation/runs/${runId}`, {
        headers: await api.commit(),
      });
    }
  }

  let selectedBrief: ContentBriefDetailResponse | null = null;
  let selectedBriefInstructions: WriterInstructionsResponse | null = null;

  if (requestedBriefId) {
    const [briefDetailResult, briefInstructionsResult] = await Promise.all([
      fetchJson<ContentBriefDetailResponse>(api, `/content/${projectId}/briefs/${requestedBriefId}`),
      fetchJson<WriterInstructionsResponse | null>(api, `/content/${projectId}/briefs/${requestedBriefId}/instructions`),
    ]);

    if (briefDetailResult.unauthorized || briefInstructionsResult.unauthorized) {
      return handleUnauthorized(api);
    }

    if (!briefDetailResult.ok || !briefDetailResult.data) {
      if (briefs.length > 0) {
        return redirect(`/projects/${projectId}/creation/runs/${runId}/briefs/${briefs[0].id}`, {
          headers: await api.commit(),
        });
      }

      return redirect(`/projects/${projectId}/creation/runs/${runId}`, {
        headers: await api.commit(),
      });
    }

    selectedBrief = briefDetailResult.data;
    if (briefInstructionsResult.ok) {
      selectedBriefInstructions = briefInstructionsResult.data;
    }
  }

  return data(
    {
      project: projectResult.data,
      runs: classified.runs,
      selectedRun,
      progress,
      briefs,
      selectedBriefId: requestedBriefId,
      selectedBrief,
      selectedBriefInstructions,
      rankedTopics: rankedTopicsResult.ok && rankedTopicsResult.data ? rankedTopicsResult.data : [],
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

  if (intent !== "startCreation" && intent !== "pausePipeline" && intent !== "resumePipeline") {
    return data({ error: "Unsupported action." } satisfies ActionData, { status: 400 });
  }

  if (intent === "startCreation") {
    const payload: PipelineStartRequest = {
      mode: "content_production",
      start_step: 0,
      content: {
        max_briefs: 20,
      },
    };

    const startResponse = await api.fetch(`/pipeline/${projectId}/start`, {
      method: "POST",
      json: payload,
    });

    if (startResponse.status === 401) return handleUnauthorized(api);

    if (!startResponse.ok) {
      return data(
        { error: "Unable to start creation run." } satisfies ActionData,
        { status: startResponse.status, headers: await api.commit() }
      );
    }

    const startedRun = (await startResponse.json()) as PipelineRunResponse;
    return redirect(`/projects/${projectId}/creation/runs/${startedRun.id}`, {
      headers: await api.commit(),
    });
  }

  if (intent === "pausePipeline") {
    const response = await api.fetch(`/pipeline/${projectId}/pause`, {
      method: "POST",
    });

    if (response.status === 401) return handleUnauthorized(api);

    if (!response.ok) {
      return data(
        { error: "Unable to pause pipeline." } satisfies ActionData,
        { status: response.status, headers: await api.commit() }
      );
    }

    return redirect(new URL(request.url).pathname, {
      headers: await api.commit(),
    });
  }

  const runId = String(formData.get("run_id") ?? params.runId ?? "").trim();
  if (!runId) {
    return data({ error: "Missing run id." } satisfies ActionData, { status: 400 });
  }

  const resumeResponse = await api.fetch(`/pipeline/${projectId}/resume/${runId}`, {
    method: "POST",
  });

  if (resumeResponse.status === 401) return handleUnauthorized(api);

  if (!resumeResponse.ok) {
    return data(
      { error: "Unable to resume pipeline." } satisfies ActionData,
      { status: resumeResponse.status, headers: await api.commit() }
    );
  }

  return redirect(new URL(request.url).pathname, {
    headers: await api.commit(),
  });
}

export default function ProjectCreationRunRoute() {
  const {
    project,
    runs,
    selectedRun,
    progress,
    briefs,
    selectedBrief,
    selectedBriefId,
    selectedBriefInstructions,
    rankedTopics,
  } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const progressFetcher = useFetcher<PipelineProgressResponse>();
  const isProgressRequestInFlightRef = useRef(false);
  const [activeView, setActiveView] = useState<"briefs" | "readiness" | "runs">("briefs");

  const liveProgress = progressFetcher.data ?? progress;
  const effectiveStatus = liveProgress?.status ?? selectedRun.status;
  const stepExecutions = (liveProgress?.steps ?? selectedRun.step_executions ?? []) as StepExecutionResponse[];

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

  const stepSummary = summarizeSteps(stepExecutions);
  const overallProgress = Math.round(liveProgress?.overall_progress ?? calculateOverallProgress(stepExecutions));

  const sortedStepExecutions = useMemo(
    () => stepExecutions.slice().sort((a, b) => a.step_number - b.step_number),
    [stepExecutions]
  );

  function buildCreationRunUrl(runId: string) {
    return `/projects/${project.id}/creation/runs/${runId}`;
  }

  function buildCreationBriefUrl(runId: string, briefId: string) {
    return `/projects/${project.id}/creation/runs/${runId}/briefs/${briefId}`;
  }

  return (
    <div className="space-y-6">
      <section className="sticky top-[5.2rem] z-10 rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-[0_16px_35px_-26px_rgba(15,23,42,0.65)] backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4b5e9f]">Content creation</p>
            <h1 className="font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="text-sm text-slate-500">Linear pipeline for outlines, briefs, and writer instructions.</p>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/projects/${project.id}/discovery`}>
              <Button variant="outline">Discovery phase</Button>
            </Link>
            <Link to="/projects">
              <Button variant="outline">Back to projects</Button>
            </Link>
            <Button variant="secondary" onClick={() => revalidator.revalidate()}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="border-slate-200 bg-slate-50/80">
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Run health</p>
                  <p className="font-semibold text-slate-900">Run {selectedRun.id.slice(0, 8)}</p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(effectiveStatus)}`}
                >
                  {formatStatusLabel(effectiveStatus)}
                </span>
              </div>
              <Progress value={overallProgress} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <p>Current step: {formatStepName(liveProgress?.current_step_name ?? "Not started")}</p>
                <p>Run started: {formatDateTime(selectedRun.started_at ?? selectedRun.created_at)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-emerald-100 px-2 py-2 text-emerald-900">
                  <p className="font-semibold">Succeeded</p>
                  <p>{stepSummary.succeeded}</p>
                </div>
                <div className="rounded-lg bg-amber-100 px-2 py-2 text-amber-900">
                  <p className="font-semibold">Active</p>
                  <p>{stepSummary.active}</p>
                </div>
                <div className="rounded-lg bg-rose-100 px-2 py-2 text-rose-900">
                  <p className="font-semibold">Failed</p>
                  <p>{stepSummary.failed}</p>
                </div>
                <div className="rounded-lg bg-slate-200 px-2 py-2 text-slate-800">
                  <p className="font-semibold">Other</p>
                  <p>{stepSummary.other}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {actionData?.error ? (
          <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {actionData.error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Form method="post">
            <input type="hidden" name="intent" value="startCreation" />
            <Button type="submit" disabled={isRunActive(effectiveStatus)}>
              Start new creation run
            </Button>
          </Form>

          <Form method="post">
            <input type="hidden" name="intent" value="pausePipeline" />
            <Button type="submit" variant="outline" disabled={!isRunActive(effectiveStatus)}>
              Pause
            </Button>
          </Form>

          <Form method="post">
            <input type="hidden" name="intent" value="resumePipeline" />
            <input type="hidden" name="run_id" value={selectedRun.id} />
            <Button type="submit" disabled={!isRunPaused(effectiveStatus) && !isRunFailed(effectiveStatus)}>
              Resume
            </Button>
          </Form>

          {selectedBriefId ? (
            <Link to={buildCreationRunUrl(selectedRun.id)}>
              <Button variant="outline">Clear brief focus</Button>
            </Link>
          ) : null}

          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            <span>Run:</span>
            <Select
              value={selectedRun.id}
              onChange={(event) => {
                const runValue = event.target.value;
                if (!runValue) return;
                navigate(buildCreationRunUrl(runValue));
              }}
              className="h-9 min-w-[260px]"
            >
              {runs.map((entry) => (
                <option key={entry.run.id} value={entry.run.id}>
                  {entry.run.id.slice(0, 8)} · {toPhaseLabel(entry.phase)} · {formatStatusLabel(entry.run.status)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Linear step timeline</CardTitle>
            <CardDescription>Content production follows a straight pipeline from discovery outputs to briefs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sortedStepExecutions.length === 0 ? (
              <p className="text-sm text-slate-500">No step executions recorded yet.</p>
            ) : (
              sortedStepExecutions.map((step) => (
                <div key={step.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Step {step.step_number}</p>
                      <p className="font-semibold text-slate-900">{formatStepName(step.step_name)}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(step.status)}`}
                    >
                      {formatStatusLabel(step.status)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Progress value={step.progress_percent} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <p>{step.progress_percent}% · {step.progress_message ?? "No message"}</p>
                    <p>
                      {formatDateTime(step.started_at)}
                      {step.completed_at ? ` -> ${formatDateTime(step.completed_at)}` : ""}
                    </p>
                  </div>
                  {step.error_message ? (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                      {step.error_message}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <Tabs>
        <TabsList>
          <TabsTrigger active={activeView === "briefs"} onClick={() => setActiveView("briefs")}>
            Briefs
          </TabsTrigger>
          <TabsTrigger active={activeView === "readiness"} onClick={() => setActiveView("readiness")}>
            Readiness
          </TabsTrigger>
          <TabsTrigger active={activeView === "runs"} onClick={() => setActiveView("runs")}>
            Runs
          </TabsTrigger>
        </TabsList>

        <TabsContent>
          {activeView === "briefs" ? (
            <Card>
              <CardHeader>
                <CardTitle>Content briefs</CardTitle>
                <CardDescription>Choose a brief to inspect generated details and writer instructions.</CardDescription>
              </CardHeader>
              <CardContent>
                {briefs.length === 0 ? (
                  <p className="text-sm text-slate-500">No briefs generated for this project yet.</p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                    <div className="space-y-2">
                      {briefs.map((brief) => (
                        <Link
                          key={brief.id}
                          to={buildCreationBriefUrl(selectedRun.id, brief.id)}
                          className={cn(
                            "block rounded-xl border px-3 py-2 text-sm",
                            selectedBriefId === brief.id
                              ? "border-[#4b5e9f] bg-[#4b5e9f]/10"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          )}
                        >
                          <p className="font-semibold text-slate-900">{brief.primary_keyword}</p>
                          <p className="text-xs text-slate-500">
                            {brief.status} · {brief.page_type ?? "unknown page type"}
                          </p>
                        </Link>
                      ))}
                    </div>

                    <div className="space-y-3">
                      {selectedBrief ? (
                        <>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <p className="font-semibold text-slate-900">Brief quality</p>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                              <div className="rounded-lg bg-slate-100 px-2 py-2">
                                <p className="font-semibold text-slate-900">Outline sections</p>
                                <p>{selectedBrief.outline?.length ?? 0}</p>
                              </div>
                              <div className="rounded-lg bg-slate-100 px-2 py-2">
                                <p className="font-semibold text-slate-900">Supporting kws</p>
                                <p>{selectedBrief.supporting_keywords?.length ?? 0}</p>
                              </div>
                              <div className="rounded-lg bg-slate-100 px-2 py-2">
                                <p className="font-semibold text-slate-900">FAQs</p>
                                <p>{selectedBrief.faq_questions?.length ?? 0}</p>
                              </div>
                              <div className="rounded-lg bg-slate-100 px-2 py-2">
                                <p className="font-semibold text-slate-900">Schema type</p>
                                <p>{selectedBrief.recommended_schema_type ?? "-"}</p>
                              </div>
                            </div>
                          </div>

                          {selectedBriefInstructions ? (
                            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                              <p className="font-semibold text-slate-900">Writer instructions</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Compliance notes, formatting requirements, and QA thresholds.
                              </p>

                              <div className="mt-3 space-y-2 text-xs">
                                <div className="rounded-lg bg-slate-100 p-2">
                                  <p className="font-semibold text-slate-900">Compliance notes</p>
                                  <p>{selectedBriefInstructions.compliance_notes?.join(", ") || "No compliance notes."}</p>
                                </div>
                                <div className="rounded-lg bg-slate-100 p-2">
                                  <p className="font-semibold text-slate-900">Forbidden claims</p>
                                  <p>
                                    {selectedBriefInstructions.forbidden_claims?.join(", ") || "No explicit restrictions."}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-slate-100 p-2">
                                  <p className="font-semibold text-slate-900">Schema guidance</p>
                                  <p>{selectedBriefInstructions.schema_guidance ?? "No schema guidance."}</p>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">Select a brief to inspect details.</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeView === "readiness" ? (
            <Card>
              <CardHeader>
                <CardTitle>Creation readiness context</CardTitle>
                <CardDescription>Top ranked topics available as upstream input for brief generation.</CardDescription>
              </CardHeader>
              <CardContent>
                {rankedTopics.length === 0 ? (
                  <p className="text-sm text-slate-500">No ranked topics available yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {rankedTopics.slice(0, 9).map((topic) => (
                      <div key={topic.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                        <p className="font-semibold text-slate-900">{topic.name}</p>
                        <p className="text-xs text-slate-500">Keywords: {topic.keyword_count}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeView === "runs" ? (
            <Card>
              <CardHeader>
                <CardTitle>Run classification snapshot</CardTitle>
                <CardDescription>Heuristic run splitting for phase-specific navigation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {runs.map((entry) => (
                  <Link
                    key={entry.run.id}
                    to={buildCreationRunUrl(entry.run.id)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-3 py-2 text-sm",
                      entry.run.id === selectedRun.id ? "border-[#4b5e9f] bg-[#4b5e9f]/10" : "border-slate-200 bg-white"
                    )}
                  >
                    <p className="font-semibold text-slate-900">
                      {entry.run.id.slice(0, 8)} · {formatDateTime(entry.run.created_at)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toPhaseBadgeClass(entry.phase)}`}
                      >
                        {toPhaseLabel(entry.phase)}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeClass(entry.run.status)}`}
                      >
                        {formatStatusLabel(entry.run.status)}
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
