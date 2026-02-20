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
  formatDateTime,
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
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];
type ContentBriefListResponse = components["schemas"]["ContentBriefListResponse"];
type ContentArticleListResponse = components["schemas"]["ContentArticleListResponse"];
type ContentArticleResponse = components["schemas"]["ContentArticleResponse"];

type LoaderData = {
  project: ProjectResponse;
  contentRuns: PipelineRunResponse[];
  latestRun: PipelineRunResponse | null;
  latestRunProgress: PipelineProgressResponse | null;
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

  const [briefsResult, articlesResult] = await Promise.all([
    fetchJson<ContentBriefListResponse>(api, `/content/${projectId}/briefs?page=1&page_size=1`),
    fetchJson<ContentArticleListResponse>(api, `/content/${projectId}/articles?page=1&page_size=100`),
  ]);

  if (briefsResult.unauthorized || articlesResult.unauthorized) {
    return handleUnauthorized(api);
  }

  const articles = articlesResult.ok && articlesResult.data ? articlesResult.data.items ?? [] : [];

  let latestRun: PipelineRunResponse | null = null;
  let latestRunProgress: PipelineProgressResponse | null = null;

  const preferred = pickLatestRunForModule(rawRuns, "content");
  if (preferred) {
    const runResult = await fetchJson<PipelineRunResponse>(api, `/pipeline/${projectId}/runs/${preferred.id}`);
    if (runResult.unauthorized) return handleUnauthorized(api);
    if (runResult.ok && runResult.data) {
      latestRun = runResult.data;

      if (isRunActive(latestRun.status)) {
        const progressResult = await fetchJson<PipelineProgressResponse>(
          api,
          `/pipeline/${projectId}/runs/${preferred.id}/progress`,
        );
        if (progressResult.unauthorized) return handleUnauthorized(api);
        if (progressResult.ok && progressResult.data) {
          latestRunProgress = progressResult.data;
        }
      }
    }
  }

  return data(
    {
      project: projectResult.data,
      contentRuns,
      latestRun,
      latestRunProgress,
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

  if (intent !== "startCreation" && intent !== "pausePipeline" && intent !== "resumePipeline") {
    return data({ error: "Unsupported action." } satisfies ActionData, { status: 400 });
  }

  if (intent === "startCreation") {
    const payload: PipelineStartRequest = {
      mode: "content",
      start_step: 0,
      content: {
        max_briefs: 20,
        posts_per_week: 1,
        min_lead_days: 7,
        use_llm_timing_hints: true,
        llm_timing_flex_days: 14,
        include_zero_data_topics: true,
        zero_data_topic_share: 0.2,
        zero_data_fit_score_min: 0.65,
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
              ? "Content creation is already running for this project."
              : "Unable to start creation run."),
        } satisfies ActionData,
        { status: startResponse.status, headers: await api.commit() },
      );
    }

    const run = (await startResponse.json()) as PipelineRunResponse;
    return redirect(`/projects/${projectId}/creation/runs/${run.id}`, {
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

  const overallProgress = liveProgress?.overall_progress ?? 0;
  const currentStepName = formatStepName(liveProgress?.current_step_name ?? null);
  const articlesInProgress = articleTotal - articlesCompleted;

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

      {/* Latest run card */}
      {latestRun ? (
        <Card className="border-[#4b5e9f]/30 bg-gradient-to-r from-indigo-50/60 to-white">
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
                <Progress value={overallProgress} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <p>Current step: {currentStepName}</p>
                  <p>Started: {formatDateTime(latestRun.started_at ?? latestRun.created_at)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
                <Form method="post">
                  <input type="hidden" name="intent" value="startCreation" />
                  <Button type="submit" className="w-full" disabled={isRunActive(effectiveStatus)}>
                    Start new run
                  </Button>
                </Form>
                <div className="flex gap-2">
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
                <Link to={`/projects/${project.id}/creation/runs/${latestRun.id}`} className="w-full">
                  <Button variant="outline" className="w-full">
                    View run details
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Start the content pipeline to generate briefs and articles from your discovery results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <input type="hidden" name="intent" value="startCreation" />
              <Button type="submit">Start creation pipeline</Button>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="group block rounded-2xl border-2 border-black border-l-4 border-l-indigo-500 bg-white shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a]">
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
          </div>
        </div>

        <div className="group block rounded-2xl border-2 border-black border-l-4 border-l-violet-500 bg-white shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a]">
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
          </div>
        </div>

        {latestRun ? (
          <Link
            to={`/projects/${project.id}/creation/runs/${latestRun.id}`}
            className="group block rounded-2xl border-2 border-black border-l-4 border-l-amber-500 bg-white shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a]"
          >
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <PenSquare className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-slate-900">Pipeline</p>
                </div>
              </div>
              <p className="mt-3 font-display text-3xl font-bold text-slate-900">{contentRuns.length}</p>
              <p className="text-sm text-slate-500">
                {contentRuns.length === 1 ? "creation run" : "creation runs"}
              </p>
              <p className="mt-2 text-xs text-amber-700 group-hover:underline">View run details &rarr;</p>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
                <PenSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-400">Pipeline</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-400">No runs yet. Start a creation pipeline above.</p>
          </div>
        )}
      </div>

      {/* Recent runs */}
      {contentRuns.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>Recent content-module runs for this project.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {contentRuns.slice(0, 8).map((run) => (
              <Link
                key={run.id}
                to={`/projects/${project.id}/creation/runs/${run.id}`}
                className="block rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-slate-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {run.id.slice(0, 8)} · {formatDateTime(run.created_at)}
                    {run.source_topic_id ? ` · Topic ${run.source_topic_id}` : ""}
                  </p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeClass(run.status)}`}
                  >
                    {formatStatusLabel(run.status)}
                  </span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
