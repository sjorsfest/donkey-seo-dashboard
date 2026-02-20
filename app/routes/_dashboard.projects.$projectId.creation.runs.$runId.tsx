import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
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
import { Layers } from "lucide-react";
import type { Route } from "./+types/_dashboard.projects.$projectId.creation.runs.$runId";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Select } from "~/components/ui/select";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import {
  calculateOverallProgress,
  formatDateTime,
  formatStatusLabel,
  formatStepName,
  formatTimelineTimestamp,
  getStatusBadgeClass,
  getTimelineDotClass,
  isRunActive,
  isRunFailed,
  isRunPaused,
} from "~/lib/dashboard";
import { filterRunsByModule, isRunInModule, pickLatestRunForModule, sortPipelineRunsNewest } from "~/lib/pipeline-module";
import { fetchJson } from "~/lib/pipeline-run.server";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];
type StepExecutionResponse = components["schemas"]["StepExecutionResponse"];
type ContentBriefListResponse = components["schemas"]["ContentBriefListResponse"];
type ContentBriefResponse = components["schemas"]["ContentBriefResponse"];
type ContentArticleListResponse = components["schemas"]["ContentArticleListResponse"];
type ContentArticleResponse = components["schemas"]["ContentArticleResponse"];
type TopicResponse = components["schemas"]["TopicResponse"];

type LoaderData = {
  project: ProjectResponse;
  runs: PipelineRunResponse[];
  selectedRun: PipelineRunResponse;
  progress: PipelineProgressResponse | null;
  briefs: ContentBriefResponse[];
  articles: ContentArticleResponse[];
  rankedTopics: TopicResponse[];
};

type ActionData = {
  error?: string;
};

type TopicGroup = {
  topic: TopicResponse | null;
  topicId: string;
  briefs: Array<{
    brief: ContentBriefResponse;
    article: ContentArticleResponse | null;
  }>;
};

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

  const api = new ApiClient(request);

  const projectResult = await fetchJson<ProjectResponse>(api, `/projects/${projectId}`);
  if (projectResult.unauthorized) return handleUnauthorized(api);
  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  const runsResult = await fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=12`);
  if (runsResult.unauthorized) return handleUnauthorized(api);

  const rawRuns = sortPipelineRunsNewest(runsResult.ok && runsResult.data ? runsResult.data : []);
  const runs = filterRunsByModule(rawRuns, "content");
  const requestedRun = rawRuns.find((entry) => entry.id === runId) ?? null;

  if (requestedRun && isRunInModule(requestedRun, "discovery")) {
    return redirect(`/projects/${projectId}/discovery/runs/${requestedRun.id}`, {
      headers: await api.commit(),
    });
  }

  const selectedRunSummary = runs.find((entry) => entry.id === runId) ?? null;
  if (!selectedRunSummary) {
    const preferred = pickLatestRunForModule(rawRuns, "content");
    if (preferred) {
      return redirect(`/projects/${projectId}/creation/runs/${preferred.id}`, {
        headers: await api.commit(),
      });
    }

    throw new Response("Pipeline run not found.", { status: 404 });
  }

  const [selectedRunResult, briefsResult, articlesResult, rankedTopicsResult] = await Promise.all([
    fetchJson<PipelineRunResponse>(api, `/pipeline/${projectId}/runs/${runId}`),
    fetchJson<ContentBriefListResponse>(api, `/content/${projectId}/briefs?page=1&page_size=100`),
    fetchJson<ContentArticleListResponse>(api, `/content/${projectId}/articles?page=1&page_size=100`),
    fetchJson<TopicResponse[]>(api, `/topics/${projectId}/ranked?limit=20`),
  ]);

  if ([selectedRunResult, briefsResult, articlesResult, rankedTopicsResult].some((r) => r.unauthorized)) {
    return handleUnauthorized(api);
  }

  if (!selectedRunResult.ok || !selectedRunResult.data) {
    throw new Response("Failed to load selected run.", { status: selectedRunResult.status });
  }

  const selectedRun = selectedRunResult.data;
  if (!isRunInModule(selectedRun, "content")) {
    if (isRunInModule(selectedRun, "discovery")) {
      return redirect(`/projects/${projectId}/discovery/runs/${selectedRun.id}`, {
        headers: await api.commit(),
      });
    }

    throw new Response("Run is not a content-module run.", { status: 409 });
  }

  let progress: PipelineProgressResponse | null = null;
  if (isRunActive(selectedRun.status)) {
    const progressResult = await fetchJson<PipelineProgressResponse>(api, `/pipeline/${projectId}/runs/${runId}/progress`);
    if (progressResult.unauthorized) return handleUnauthorized(api);
    if (progressResult.ok && progressResult.data) {
      progress = progressResult.data;
    }
  }

  const briefs = briefsResult.ok && briefsResult.data ? briefsResult.data.items ?? [] : [];
  const articles = articlesResult.ok && articlesResult.data ? articlesResult.data.items ?? [] : [];

  return data(
    {
      project: projectResult.data,
      runs,
      selectedRun,
      progress,
      briefs,
      articles,
      rankedTopics: rankedTopicsResult.ok && rankedTopicsResult.data ? rankedTopicsResult.data : [],
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

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const api = new ApiClient(request);

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

    const startedRun = (await startResponse.json()) as PipelineRunResponse;
    return redirect(`/projects/${projectId}/creation/runs/${startedRun.id}`, {
      headers: await api.commit(),
    });
  }

  if (intent === "pausePipeline") {
    const runId = String(formData.get("run_id") ?? params.runId ?? "").trim();
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

    return redirect(new URL(request.url).pathname, {
      headers: await api.commit(),
    });
  }

  // resumePipeline
  const runId = String(formData.get("run_id") ?? params.runId ?? "").trim();
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

  return redirect(new URL(request.url).pathname, {
    headers: await api.commit(),
  });
}

// ---------------------------------------------------------------------------
// Step timeline components
// ---------------------------------------------------------------------------

function StepTimelineItem({
  execution,
  isFirstItem,
  isLastItem,
  animationIndex,
}: {
  execution: StepExecutionResponse;
  isFirstItem: boolean;
  isLastItem: boolean;
  animationIndex: number;
}) {
  return (
    <motion.div
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
            getTimelineDotClass(execution.status),
          )}
        />
      </div>

      <div
        className={cn(
          "col-start-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_12px_30px_-16px_rgba(15,23,42,0.45)] md:col-start-3",
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
        {execution.progress_percent > 0 && execution.progress_percent < 100 ? (
          <div className="mt-2">
            <Progress value={execution.progress_percent} />
          </div>
        ) : null}
        {execution.error_message ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
            {execution.error_message}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Topic group components
// ---------------------------------------------------------------------------

function BriefRow({
  brief,
  article,
  runIsActive,
  runId,
  projectId,
}: {
  brief: ContentBriefResponse;
  article: ContentArticleResponse | null;
  runIsActive: boolean;
  runId: string;
  projectId: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{brief.primary_keyword}</p>
          <p className="text-xs text-slate-500">
            {brief.page_type ?? "Unknown type"} · {brief.funnel_stage ?? "Unknown stage"}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {article ? (
            <Badge variant="success">Article ready</Badge>
          ) : runIsActive ? (
            <Badge variant="warning">Generating...</Badge>
          ) : (
            <Badge variant="muted">No article</Badge>
          )}
          <Link to={`/projects/${projectId}/creation/runs/${runId}/briefs/${brief.id}`}>
            <Button variant="outline" size="sm">
              View
            </Button>
          </Link>
        </div>
      </div>
      {article ? (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <p className="font-medium text-slate-800">{article.title}</p>
          <p className="text-xs text-slate-400">/{article.slug} · v{article.current_version}</p>
        </div>
      ) : null}
    </div>
  );
}

function TopicGroupCard({
  group,
  runIsActive,
  runId,
  projectId,
  animationIndex,
}: {
  group: TopicGroup;
  runIsActive: boolean;
  runId: string;
  projectId: string;
  animationIndex: number;
}) {
  const articleCount = group.briefs.filter((b) => b.article !== null).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: animationIndex * 0.05 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{group.topic?.name ?? "Ungrouped briefs"}</CardTitle>
              <CardDescription>
                {group.briefs.length} {group.briefs.length === 1 ? "brief" : "briefs"} · {articleCount}{" "}
                {articleCount === 1 ? "article" : "articles"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {group.briefs.map(({ brief, article }) => (
            <BriefRow
              key={brief.id}
              brief={brief}
              article={article}
              runIsActive={runIsActive}
              runId={runId}
              projectId={projectId}
            />
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProjectCreationRunRoute() {
  const {
    project,
    runs,
    selectedRun,
    progress,
    briefs,
    articles,
    rankedTopics,
  } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const progressFetcher = useFetcher<PipelineProgressResponse>();
  const isProgressRequestInFlightRef = useRef(false);

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

  const overallProgress = Math.round(liveProgress?.overall_progress ?? calculateOverallProgress(stepExecutions));

  const sortedStepExecutions = useMemo(
    () => stepExecutions.slice().sort((a, b) => a.step_number - b.step_number),
    [stepExecutions],
  );

  // Build topic → brief → article mapping
  const topicGroups = useMemo<TopicGroup[]>(() => {
    const articleByBriefId = new Map<string, ContentArticleResponse>();
    for (const article of articles) {
      articleByBriefId.set(article.brief_id, article);
    }

    const topicMap = new Map<string, TopicResponse>();
    for (const topic of rankedTopics) {
      topicMap.set(topic.id, topic);
    }

    const groupMap = new Map<string, TopicGroup>();

    for (const brief of briefs) {
      const topicId = brief.topic_id ?? "__ungrouped__";
      if (!groupMap.has(topicId)) {
        groupMap.set(topicId, {
          topic: topicMap.get(topicId) ?? null,
          topicId,
          briefs: [],
        });
      }
      groupMap.get(topicId)!.briefs.push({
        brief,
        article: articleByBriefId.get(brief.id) ?? null,
      });
    }

    // Sort: named topics first (alphabetically), ungrouped last
    return Array.from(groupMap.values()).sort((a, b) => {
      if (!a.topic && b.topic) return 1;
      if (a.topic && !b.topic) return -1;
      const nameA = a.topic?.name ?? "";
      const nameB = b.topic?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  }, [briefs, articles, rankedTopics]);

  function buildCreationRunUrl(runId: string) {
    return `/projects/${project.id}/creation/runs/${runId}`;
  }

  const runIsActive = isRunActive(effectiveStatus);

  return (
    <div className="space-y-6">
      {/* Gradient header */}
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f4f5fb] to-[#eef4ff] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4b5e9f]">
                Run {selectedRun.id.slice(0, 8)}
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            </div>
            <span
              className={`inline-flex self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(effectiveStatus)}`}
            >
              {formatStatusLabel(effectiveStatus)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Form method="post">
              <input type="hidden" name="intent" value="startCreation" />
              <Button type="submit" disabled={runIsActive}>
                Start new run
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="pausePipeline" />
              <input type="hidden" name="run_id" value={selectedRun.id} />
              <Button type="submit" variant="outline" disabled={!runIsActive}>
                Pause
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="resumePipeline" />
              <input type="hidden" name="run_id" value={selectedRun.id} />
              <Button
                type="submit"
                variant="outline"
                disabled={!isRunPaused(effectiveStatus) && !isRunFailed(effectiveStatus)}
              >
                Resume
              </Button>
            </Form>
            <Link to={`/projects/${project.id}/creation`}>
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
            <p>
              {overallProgress}% · {formatStepName(liveProgress?.current_step_name ?? "Not started")}
            </p>
            <p>Started {formatDateTime(selectedRun.started_at ?? selectedRun.created_at)}</p>
          </div>
        </div>

        {/* Run selector */}
        {runs.length > 1 ? (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Switch run:</span>
              <Select
                value={selectedRun.id}
                onChange={(event) => {
                  const runValue = event.target.value;
                  if (!runValue) return;
                  navigate(buildCreationRunUrl(runValue));
                }}
                className="h-9 min-w-[260px]"
              >
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.id.slice(0, 8)} · {run.source_topic_id ? `Topic ${run.source_topic_id}` : "Content run"} ·{" "}
                    {formatStatusLabel(run.status)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        ) : null}
      </section>

      {actionData?.error ? (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {actionData.error}
        </p>
      ) : null}

      {/* Step timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Step timeline</CardTitle>
          <CardDescription>Content production pipeline progress.</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedStepExecutions.length === 0 ? (
            <p className="text-sm text-slate-500">No step executions recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {sortedStepExecutions.map((step, index) => (
                <StepTimelineItem
                  key={step.id}
                  execution={step}
                  isFirstItem={index === 0}
                  isLastItem={index === sortedStepExecutions.length - 1}
                  animationIndex={index}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Topic-grouped content */}
      {briefs.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">Topics &amp; Articles</h2>
            <p className="text-sm text-slate-500">
              {briefs.length} {briefs.length === 1 ? "brief" : "briefs"} across {topicGroups.length}{" "}
              {topicGroups.length === 1 ? "topic" : "topics"}
            </p>
          </div>
          {topicGroups.map((group, index) => (
            <TopicGroupCard
              key={group.topicId}
              group={group}
              runIsActive={runIsActive}
              runId={selectedRun.id}
              projectId={project.id}
              animationIndex={index}
            />
          ))}
        </section>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-slate-500">
              {runIsActive
                ? "Briefs are being generated. They will appear here as the pipeline progresses."
                : "No briefs have been generated for this project yet."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Other runs */}
      {runs.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Other runs</CardTitle>
            <CardDescription>Content-module runs for this project.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs
              .filter((run) => run.id !== selectedRun.id)
              .slice(0, 6)
              .map((run) => (
                <Link
                  key={run.id}
                  to={buildCreationRunUrl(run.id)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:border-slate-300"
                >
                  <p className="font-semibold text-slate-900">
                    {run.id.slice(0, 8)} · {formatDateTime(run.created_at)}
                    {run.source_topic_id ? ` · Topic ${run.source_topic_id}` : ""}
                  </p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeClass(run.status)}`}
                  >
                    {formatStatusLabel(run.status)}
                  </span>
                </Link>
              ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
