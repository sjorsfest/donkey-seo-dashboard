import { useEffect, useRef } from "react";
import { Form, Link, data, redirect, useActionData, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { FileText, BookOpen, PenSquare } from "lucide-react";
import type { Route } from "./+types/_dashboard.projects.$projectId.creation";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import {
  calculateOverallProgress,
  formatStatusLabel,
  formatStepName,
  getStatusBadgeClass,
  isRunActive,
  isRunFailed,
  isRunPaused,
} from "~/lib/dashboard";
import { filterRunsByModule, pickLatestRunForModule, sortPipelineRunsNewest } from "~/lib/pipeline-module";
import { fetchJson } from "~/lib/pipeline-run.server";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];
type ContentBriefListResponse = components["schemas"]["ContentBriefListResponse"];
type ContentArticleListResponse = components["schemas"]["ContentArticleListResponse"];
type ContentArticleResponse = components["schemas"]["ContentArticleResponse"];

type LoaderData = {
  project: ProjectResponse;
  contentRuns: PipelineRunResponse[];
  latestRun: PipelineRunResponse | null;
  latestRunProgress: PipelineProgressResponse | null;
  runProgressById: Record<string, PipelineProgressResponse>;
  briefTotal: number;
  articleTotal: number;
  articlesCompleted: number;
};

type ActionData = { error?: string };

async function handleUnauthorized(api: ApiClient) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

function countCompletedArticles(articles: ContentArticleResponse[]): number {
  const completedStatuses = new Set(["completed", "success", "done", "published"]);
  return articles.filter((a) => completedStatuses.has(a.status.toLowerCase())).length;
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
  const contentRuns = filterRunsByModule(rawRuns, "content");
  const runProgressById: Record<string, PipelineProgressResponse> = {};

  const activeContentRuns = contentRuns.filter((run) => isRunActive(run.status));
  if (activeContentRuns.length > 0) {
    const progressResults = await Promise.all(
      activeContentRuns.map((run) => fetchJson<PipelineProgressResponse>(api, `/pipeline/${projectId}/runs/${run.id}/progress`)),
    );

    if (progressResults.some((result) => result.unauthorized)) {
      return handleUnauthorized(api);
    }

    activeContentRuns.forEach((run, index) => {
      const progressResult = progressResults[index];
      if (progressResult?.ok && progressResult.data) {
        runProgressById[run.id] = progressResult.data;
      }
    });
  }

  const [briefsResult, articlesResult] = await Promise.all([
    fetchJson<ContentBriefListResponse>(api, `/content/${projectId}/briefs?page=1&page_size=1`),
    fetchJson<ContentArticleListResponse>(api, `/content/${projectId}/articles?page=1&page_size=100`),
  ]);

  if (briefsResult.unauthorized || articlesResult.unauthorized) {
    return handleUnauthorized(api);
  }

  const articles = articlesResult.ok && articlesResult.data ? articlesResult.data.items ?? [] : [];

  const preferred = pickLatestRunForModule(rawRuns, "content");
  const latestRun = preferred ?? null;
  const latestRunProgress = latestRun ? runProgressById[latestRun.id] ?? null : null;

  return data(
    {
      project: projectResult.data,
      contentRuns,
      latestRun,
      latestRunProgress,
      runProgressById,
      briefTotal: briefsResult.ok && briefsResult.data ? briefsResult.data.total : 0,
      articleTotal: articles.length,
      articlesCompleted: countCompletedArticles(articles),
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    },
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

  if (intent !== "pausePipeline" && intent !== "resumePipeline") {
    return data({ error: "Unsupported action." } satisfies ActionData, { status: 400 });
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
        { status: response.status, headers: await api.commit() },
      );
    }

    return redirect(`/projects/${projectId}/creation`, {
      headers: await api.commit(),
    });
  }

  // resumePipeline
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
            ? "Content creation is already running for this project."
            : "Unable to resume pipeline."),
      } satisfies ActionData,
      { status: resumeResponse.status, headers: await api.commit() },
    );
  }

  return redirect(`/projects/${projectId}/creation`, {
    headers: await api.commit(),
  });
}

export default function ProjectCreationHubRoute() {
  const {
    project,
    contentRuns,
    latestRun,
    latestRunProgress,
    runProgressById,
    briefTotal,
    articleTotal,
    articlesCompleted,
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

  const articlesInProgress = articleTotal - articlesCompleted;
  const contentDetailsHref = latestRun ? `/projects/${project.id}/creation/runs/${latestRun.id}` : `/projects/${project.id}/creation`;

  function getRunStatus(run: PipelineRunResponse) {
    if (run.id === latestRun?.id && effectiveStatus) {
      return effectiveStatus;
    }
    return runProgressById[run.id]?.status ?? run.status;
  }

  function getRunProgress(run: PipelineRunResponse) {
    if (run.id === latestRun?.id && liveProgress) {
      return liveProgress.overall_progress ?? 0;
    }
    const liveRunProgress = runProgressById[run.id];
    if (liveRunProgress) {
      return liveRunProgress.overall_progress ?? 0;
    }
    return calculateOverallProgress(run.step_executions ?? []);
  }

  function isRunInProgress(run: PipelineRunResponse) {
    const progress = getRunProgress(run);
    return progress > 0 && progress < 100;
  }

  function getRunStepLabel(run: PipelineRunResponse) {
    if (run.id === latestRun?.id && liveProgress?.current_step_name) {
      return formatStepName(liveProgress.current_step_name);
    }

    const liveRunProgress = runProgressById[run.id];
    if (liveRunProgress?.current_step_name) {
      return formatStepName(liveRunProgress.current_step_name);
    }

    const sortedSteps = (run.step_executions ?? []).slice().sort((a, b) => b.step_number - a.step_number);
    const activeStep = sortedSteps.find((step) => isRunActive(step.status));
    if (activeStep) return formatStepName(activeStep.step_name);

    const latestCompleted = sortedSteps.find((step) => step.progress_percent > 0);
    if (latestCompleted) return formatStepName(latestCompleted.step_name);

    return formatStepName(null);
  }

  const sortedContentRuns = contentRuns
    .slice()
    .sort((a, b) => {
      const aIsInProgress = isRunInProgress(a);
      const bIsInProgress = isRunInProgress(b);
      if (aIsInProgress === bIsInProgress) return 0;
      return aIsInProgress ? -1 : 1;
    })
    .slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f4f5fb] to-[#eef4ff] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4b5e9f]">Content creation</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Content brief generation, article rendering, and publishing pipeline.
            </p>
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
      </section>

      {actionData?.error ? (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {actionData.error}
        </p>
      ) : null}

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          to={contentDetailsHref}
          className="group block rounded-2xl border-2 border-black border-l-4 border-l-indigo-500 bg-white shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a]"
        >
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-900">Briefs</p>
              </div>
            </div>
            <p className="mt-3 font-display text-3xl font-bold text-slate-900">{briefTotal}</p>
            <p className="text-sm text-slate-500">total briefs generated</p>
            <p className="mt-1 text-xs text-slate-400">Open briefs and article previews</p>
          </div>
        </Link>

        <Link
          to={contentDetailsHref}
          className="group block rounded-2xl border-2 border-black border-l-4 border-l-violet-500 bg-white shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a]"
        >
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-900">Articles</p>
              </div>
            </div>
            <p className="mt-3 font-display text-3xl font-bold text-slate-900">{articleTotal}</p>
            <p className="text-sm text-slate-500">articles rendered</p>
            {articleTotal > 0 ? (
              <p className="mt-1 text-xs text-slate-400">
                {articlesCompleted} completed{articlesInProgress > 0 ? `, ${articlesInProgress} in progress` : ""}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-slate-400">Open briefs and article previews</p>
          </div>
        </Link>

        {latestRun ? (
          <div className="rounded-2xl border-2 border-black border-l-4 border-l-amber-500 bg-white shadow-[4px_4px_0_#1a1a1a]">
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <PenSquare className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-slate-900">Drafting</p>
                </div>
              </div>
              <p className="mt-3 font-display text-3xl font-bold text-slate-900">{contentRuns.length}</p>
              <p className="text-sm text-slate-500">{contentRuns.length === 1 ? "drafting process" : "drafting processes"}</p>
              <p className="mt-2 text-xs text-slate-500">
                Latest status: {formatStatusLabel(effectiveStatus)}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
                <PenSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-400">Drafting</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-400">No drafting processes yet. Waiting for backend orchestration.</p>
          </div>
        )}
      </div>

      {/* Drafting processes */}
      {contentRuns.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Drafting processes</CardTitle>
            <CardDescription>In-progress processes are pinned to the top.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sortedContentRuns.map((run) => {
              const runStatus = getRunStatus(run);
              const runProgress = getRunProgress(run);
              const runProgressLabel = Math.round(runProgress);
              const runIsInProgress = runProgress > 0 && runProgress < 100;
              const runIsActive = isRunActive(runStatus);

              return (
                <div key={run.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeClass(runStatus)}`}
                  >
                    {formatStatusLabel(runStatus)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Form method="post">
                      <input type="hidden" name="intent" value="pausePipeline" />
                      <input type="hidden" name="run_id" value={run.id} />
                      <Button type="submit" variant="outline" size="sm" disabled={!runIsActive}>
                        Pause
                      </Button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="resumePipeline" />
                      <input type="hidden" name="run_id" value={run.id} />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={!isRunPaused(runStatus) && !isRunFailed(runStatus)}
                      >
                        Resume
                      </Button>
                    </Form>
                  </div>
                </div>
                <div className="mt-3">
                  <Progress value={runProgress} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  {runIsInProgress ? <p>Current step: {getRunStepLabel(run)}</p> : <span />}
                  <p>{runProgressLabel}%</p>
                </div>
              </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
