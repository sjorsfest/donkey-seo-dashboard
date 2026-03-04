import { useEffect, useRef } from "react";
import { Link, data, redirect, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { FileText, BookOpen, PenSquare, Sparkles } from "lucide-react";
import type { Route } from "./+types/_dashboard.projects.$projectId.creation";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { RouteErrorBoundaryCard } from "~/components/errors/route-error-boundary";
import { ApiClient } from "~/lib/api.server";
import {
  calculateOverallProgress,
  formatStatusLabel,
  formatStepName,
  getStatusBadgeClass,
  isRunActive,
} from "~/lib/dashboard";
import { filterRunsByModule, pickLatestRunForModule, sortPipelineRunsNewest } from "~/lib/pipeline-module";
import { fetchJson } from "~/lib/pipeline-run.server";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];
type ContentBriefListResponse = components["schemas"]["ContentBriefListResponse"];
type ContentBriefResponse = components["schemas"]["ContentBriefResponse"];
type ContentArticleListResponse = components["schemas"]["ContentArticleListResponse"];
type ContentArticleResponse = components["schemas"]["ContentArticleResponse"];
type StepExecutionResponse = components["schemas"]["StepExecutionResponse"];

type LoaderData = {
  project: ProjectResponse;
  contentRuns: PipelineRunResponse[];
  latestRun: PipelineRunResponse | null;
  latestRunProgress: PipelineProgressResponse | null;
  runProgressById: Record<string, PipelineProgressResponse>;
  runPrimaryBriefIdByRunId: Record<string, string | null>;
  briefsById: Record<string, ContentBriefResponse>;
  briefTotal: number;
  articleTotal: number;
  articlesCompleted: number;
};

const STEP_SUCCESS_STATUSES = new Set(["completed", "success", "succeeded", "done"]);

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

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isWithinRunWindow(timestamp: string, windowStartMs: number | null, windowEndMs: number | null) {
  const parsedTimestamp = parseTimestamp(timestamp);
  if (parsedTimestamp === null) return true;
  if (windowStartMs !== null && parsedTimestamp < windowStartMs) return false;
  if (windowEndMs !== null && parsedTimestamp >= windowEndMs) return false;
  return true;
}

function isSuccessfulStepStatus(status: string | null | undefined) {
  return STEP_SUCCESS_STATUSES.has(String(status ?? "").toLowerCase());
}

function isArticleGenerationStep(stepName: string | null | undefined) {
  const normalized = String(stepName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return normalized.includes("articlegeneration");
}

function hasCompletedArticleGenerationStep(steps: StepExecutionResponse[] | null | undefined) {
  if (!steps || steps.length === 0) return false;
  return steps.some((step) => isArticleGenerationStep(step.step_name) && isSuccessfulStepStatus(step.status));
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
    fetchJson<ContentBriefListResponse>(api, `/content/${projectId}/briefs?page=1&page_size=100`),
    fetchJson<ContentArticleListResponse>(api, `/content/${projectId}/articles?page=1&page_size=100`),
  ]);

  if (briefsResult.unauthorized || articlesResult.unauthorized) {
    return handleUnauthorized(api);
  }

  const briefs = briefsResult.ok && briefsResult.data ? briefsResult.data.items ?? [] : [];
  const articles = articlesResult.ok && articlesResult.data ? articlesResult.data.items ?? [] : [];
  const briefIdsWithArticles = new Set(articles.map((article) => article.brief_id));
  const briefsSortedNewestFirst = briefs.slice().sort((a, b) => {
    const aTimestamp = parseTimestamp(a.created_at) ?? 0;
    const bTimestamp = parseTimestamp(b.created_at) ?? 0;
    return bTimestamp - aTimestamp;
  });
  const briefsWithArticlesSortedNewestFirst = briefsSortedNewestFirst.filter((brief) => briefIdsWithArticles.has(brief.id));
  const briefsByTopicId = new Map<string, ContentBriefResponse[]>();
  const briefsWithArticlesByTopicId = new Map<string, ContentBriefResponse[]>();
  for (const brief of briefsSortedNewestFirst) {
    if (!brief.topic_id) continue;
    if (!briefsByTopicId.has(brief.topic_id)) {
      briefsByTopicId.set(brief.topic_id, []);
    }
    briefsByTopicId.get(brief.topic_id)!.push(brief);

    if (!briefIdsWithArticles.has(brief.id)) continue;
    if (!briefsWithArticlesByTopicId.has(brief.topic_id)) {
      briefsWithArticlesByTopicId.set(brief.topic_id, []);
    }
    briefsWithArticlesByTopicId.get(brief.topic_id)!.push(brief);
  }

  const runPrimaryBriefIdByRunId = contentRuns.reduce<Record<string, string | null>>((acc, run, index) => {
    const nextNewerRun = index > 0 ? contentRuns[index - 1] : null;
    const windowStartMs = parseTimestamp(run.started_at ?? run.created_at);
    const windowEndMs = parseTimestamp(nextNewerRun?.started_at ?? nextNewerRun?.created_at);

    const runBriefs = briefs
      .filter((brief: ContentBriefResponse) => {
        if (run.source_topic_id && brief.topic_id !== run.source_topic_id) return false;
        return isWithinRunWindow(brief.created_at, windowStartMs, windowEndMs);
      })
      .sort((a, b) => {
        const aTimestamp = parseTimestamp(a.created_at) ?? 0;
        const bTimestamp = parseTimestamp(b.created_at) ?? 0;
        return bTimestamp - aTimestamp;
      });

    let preferredBrief: ContentBriefResponse | null =
      runBriefs.find((brief) => briefIdsWithArticles.has(brief.id)) ?? runBriefs[0] ?? null;
    if (!preferredBrief && hasCompletedArticleGenerationStep(run.step_executions ?? [])) {
      if (run.source_topic_id) {
        preferredBrief =
          briefsWithArticlesByTopicId.get(run.source_topic_id)?.[0] ??
          briefsByTopicId.get(run.source_topic_id)?.[0] ??
          null;
      }

      if (!preferredBrief) {
        preferredBrief = briefsWithArticlesSortedNewestFirst[0] ?? null;
      }
    }

    acc[run.id] = preferredBrief?.id ?? null;
    return acc;
  }, {});

  const preferred = pickLatestRunForModule(rawRuns, "content");
  const latestRun = preferred ?? null;
  const latestRunProgress = latestRun ? runProgressById[latestRun.id] ?? null : null;

  const briefsById = briefs.reduce<Record<string, ContentBriefResponse>>((acc, brief) => {
    acc[brief.id] = brief;
    return acc;
  }, {});

  return data(
    {
      project: projectResult.data,
      contentRuns,
      latestRun,
      latestRunProgress,
      runProgressById,
      runPrimaryBriefIdByRunId,
      briefsById,
      briefTotal: briefsResult.ok && briefsResult.data ? briefsResult.data.total : 0,
      articleTotal: articles.length,
      articlesCompleted: countCompletedArticles(articles),
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    },
  );
}

export default function ProjectCreationHubRoute() {
  const {
    project,
    contentRuns,
    latestRun,
    latestRunProgress,
    runProgressById,
    runPrimaryBriefIdByRunId,
    briefsById,
    briefTotal,
    articleTotal,
    articlesCompleted,
  } = useLoaderData<typeof loader>() as LoaderData;
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

  function getRunStepExecutions(run: PipelineRunResponse) {
    if (run.id === latestRun?.id && liveProgress?.steps) {
      return liveProgress.steps as StepExecutionResponse[];
    }
    const liveRunProgress = runProgressById[run.id];
    if (liveRunProgress?.steps) {
      return liveRunProgress.steps as StepExecutionResponse[];
    }
    return (run.step_executions ?? []) as StepExecutionResponse[];
  }

  function hasRunCompletedArticleGeneration(run: PipelineRunResponse) {
    return hasCompletedArticleGenerationStep(getRunStepExecutions(run));
  }

  function getRunProgress(run: PipelineRunResponse) {
    if (hasRunCompletedArticleGeneration(run)) {
      return 100;
    }

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

  function getArticleName(run: PipelineRunResponse): string | null {
    const briefId = runPrimaryBriefIdByRunId[run.id];
    if (!briefId) return null;

    const brief = briefsById[briefId];
    if (!brief) return null;

    // Prefer working title if available, otherwise use primary keyword
    if (brief.working_titles && brief.working_titles.length > 0 && brief.working_titles[0]) {
      return brief.working_titles[0];
    }

    return brief.primary_keyword;
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
            <Link to="/project">
              <Button variant="outline">Back to project</Button>
            </Link>
            <Button variant="secondary" onClick={() => revalidator.revalidate()}>
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {/* Show explainer when no content exists yet */}
      {briefTotal === 0 && articleTotal === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white p-12">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
              <Sparkles className="h-8 w-8 text-indigo-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Content Creation Awaits
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              The <strong>Content</strong> page will populate with briefs and articles once your first{" "}
              <strong>keyword discovery phase</strong> has been completed. Discovery is where the magic begins—researching
              keywords, creating topics, and running research loops.
            </p>
            <div className="mt-8">
              <Link to={`/projects/${project.id}/discovery`}>
                <Button size="lg" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Go to Discovery
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border-2 border-black border-l-4 border-l-indigo-500 bg-white shadow-[4px_4px_0_#1a1a1a]">
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
                <p className="mt-1 text-xs text-slate-400">Open briefs from the Articles card</p>
              </div>
            </div>

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
        </>
      )}

      {/* Drafting processes - only show when there's content */}
      {briefTotal > 0 || articleTotal > 0 ? (
        contentRuns.length > 0 ? (
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
                const runStatusLower = (runStatus ?? "").toLowerCase();
                const runCompletedViaArticleGeneration = hasRunCompletedArticleGeneration(run);
                const runIsCompleted =
                  runCompletedViaArticleGeneration ||
                  runProgress >= 100 ||
                  runStatusLower === "completed" ||
                  runStatusLower === "success" ||
                  runStatusLower === "done";
                const runPrimaryBriefId = runPrimaryBriefIdByRunId[run.id];
                const showArticleCta = runIsCompleted && (Boolean(runPrimaryBriefId) || runCompletedViaArticleGeneration);
                const runActionHref = showArticleCta
                  ? runPrimaryBriefId
                    ? `/projects/${project.id}/creation/runs/${run.id}/briefs/${runPrimaryBriefId}`
                    : `/projects/${project.id}/creation/runs/${run.id}`
                  : `/projects/${project.id}/creation/runs/${run.id}`;
                const runActionLabel = showArticleCta ? "View article" : "View progress";
                const articleName = getArticleName(run);

                return (
                  <div key={run.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeClass(runStatus)}`}
                        >
                          {formatStatusLabel(runStatus)}
                        </span>
                        {articleName && (
                          <span className="text-sm font-medium text-slate-700">{articleName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Link to={runActionHref}>
                          <Button type="button" variant="outline" size="sm">
                            {runActionLabel}
                          </Button>
                        </Link>
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
        ) : null
      ) : null}
    </div>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const projectId = params.projectId;
  const safeHref = projectId ? `/projects/${encodeURIComponent(projectId)}/creation` : "/project";

  return (
    <RouteErrorBoundaryCard
      error={error}
      variant="panel"
      title="Content overview unavailable"
      description="The content hub failed to load for this project."
      safeHref={safeHref}
      safeLabel={projectId ? "Back to content overview" : "Back to dashboard"}
      retryLabel="Retry content page"
      showStatus
    />
  );
}
