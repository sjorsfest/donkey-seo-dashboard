import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link, data, redirect, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/_dashboard.projects._index";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import { ApiClient } from "~/lib/api.server";
import { formatDateTime, formatStatusLabel, getStatusBadgeClass, summarizeSteps } from "~/lib/dashboard";
import { sortPipelineRunsNewest } from "~/lib/pipeline-module";
import type { components } from "~/types/api.generated";

type ProjectListResponse = components["schemas"]["ProjectListResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type BrandVisualContextResponse = components["schemas"]["BrandVisualContextResponse"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];

type RunCounts = {
  total: number;
  queued: number;
  active: number;
  paused: number;
  completed: number;
  failed: number;
};

type ProjectOverviewSummary = {
  latestRun: PipelineRunResponse | null;
  latestSetupRun: PipelineRunResponse | null;
  runCounts: RunCounts;
  brand: {
    companyName: string | null;
    assets: number;
    confidence: number | null;
    syncedAt: string | null;
  } | null;
};

type LoaderData = {
  projects: ProjectResponse[];
  summaryByProject: Record<string, ProjectOverviewSummary>;
};

function isActiveStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "queued" || normalized === "running" || normalized === "in_progress";
}

function isTerminalStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  return (
    normalized === "completed" ||
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "paused" ||
    normalized === "cancelled"
  );
}

function summarizeRunCounts(runs: PipelineRunResponse[]): RunCounts {
  const counts: RunCounts = {
    total: runs.length,
    queued: 0,
    active: 0,
    paused: 0,
    completed: 0,
    failed: 0,
  };

  for (const run of runs) {
    const status = String(run.status ?? "").toLowerCase();
    if (status === "queued") counts.queued += 1;
    if (status === "running" || status === "in_progress" || status === "queued") counts.active += 1;
    if (status === "paused") counts.paused += 1;
    if (status === "completed" || status === "success" || status === "succeeded" || status === "done") counts.completed += 1;
    if (status === "failed" || status === "error") counts.failed += 1;
  }

  return counts;
}

export async function loader({ request }: Route.LoaderArgs) {
  const api = new ApiClient(request);
  const response = await api.fetch("/projects/");

  if (response.status === 401) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  if (!response.ok) {
    throw new Response("Failed to load projects.", { status: response.status });
  }

  const projectsPayload = (await response.json()) as ProjectListResponse;
  const projects = (projectsPayload.items ?? []) as ProjectResponse[];

  const summaryResults = await Promise.all(
    projects.map(async (project) => {
      const [runsResponse, brandResponse] = await Promise.all([
        api.fetch(`/pipeline/${project.id}/runs?limit=20`),
        api.fetch(`/brand/${project.id}/visual-context`),
      ]);

      if (runsResponse.status === 401 || brandResponse.status === 401) {
        return {
          unauthorized: true,
          projectId: project.id,
          summary: null as ProjectOverviewSummary | null,
        };
      }

      const runs = runsResponse.ok ? ((await runsResponse.json()) as PipelineRunResponse[]) : [];
      const sortedRuns = sortPipelineRunsNewest(runs);
      const latestRun = sortedRuns[0] ?? null;
      const latestSetupRun =
        sortedRuns.find((run) => String(run.pipeline_module ?? "").toLowerCase() === "setup") ?? null;
      const runCounts = summarizeRunCounts(sortedRuns);

      const brand = brandResponse.ok ? ((await brandResponse.json()) as BrandVisualContextResponse) : null;

      return {
        unauthorized: false,
        projectId: project.id,
        summary: {
          latestRun,
          latestSetupRun,
          runCounts,
          brand: brand
            ? {
                companyName: brand.company_name ?? null,
                assets: brand.brand_assets?.length ?? 0,
                confidence: brand.visual_extraction_confidence ?? null,
                syncedAt: brand.visual_last_synced_at ?? null,
              }
            : null,
        } satisfies ProjectOverviewSummary,
      };
    })
  );

  if (summaryResults.some((result) => result.unauthorized)) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  const summaryByProject: Record<string, ProjectOverviewSummary> = {};
  for (const result of summaryResults) {
    summaryByProject[result.projectId] =
      result.summary ??
      ({
        latestRun: null,
        latestSetupRun: null,
        runCounts: summarizeRunCounts([]),
        brand: null,
      } satisfies ProjectOverviewSummary);
  }

  return data(
    {
      projects,
      summaryByProject,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export default function ProjectsOverviewRoute() {
  const { projects, summaryByProject } = useLoaderData<typeof loader>() as LoaderData;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0f6f5] to-[#eef1f8] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Dashboard</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Pipeline Portfolio</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Track every project at a glance, then jump into details, discovery, or creation flows.
            </p>
          </div>
          <Link to="/projects/new" className="inline-flex">
            <Button size="lg" className="shadow-lg shadow-[#2f6f71]/20">
              New project
            </Button>
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-slate-900">Your projects</h2>
          <Badge variant="info">{projects.length} total</Badge>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed bg-white/80">
            <CardHeader>
              <CardTitle>No projects yet</CardTitle>
              <CardDescription>Start with a guided wizard and launch your first SEO pipeline in minutes.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Link to="/projects/new" className="inline-flex">
                <Button>Create your first project</Button>
              </Link>
            </CardFooter>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, index) => {
              const summary = summaryByProject[project.id];
              const latestRun = summary?.latestRun ?? null;
              const latestSetupRun = summary?.latestSetupRun ?? null;
              const stepSummary = latestRun ? summarizeSteps(latestRun.step_executions ?? []) : null;
              const brand = summary?.brand ?? null;
              const showBrandSetupProgress = !brand && Boolean(latestSetupRun && isActiveStatus(latestSetupRun.status));

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: index * 0.04 }}
                >
                  <Card className="h-full border-slate-200 bg-white">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle>{project.name}</CardTitle>
                          <CardDescription>{project.domain}</CardDescription>
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(project.status)}`}
                        >
                          {formatStatusLabel(project.status)}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                        <div>
                          <p className="font-semibold text-slate-800">Current step</p>
                          <p>#{project.current_step}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">Updated</p>
                          <p>{formatDateTime(project.updated_at)}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">Runs</p>
                          <p>{summary?.runCounts.total ?? 0}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">Active runs</p>
                          <p>{summary?.runCounts.active ?? 0}</p>
                        </div>
                      </div>

                      {showBrandSetupProgress && latestSetupRun ? (
                        <BrandSetupProgress projectId={project.id} setupRunId={latestSetupRun.id} initialStatus={latestSetupRun.status} />
                      ) : (
                        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                          <div>
                            <p className="font-semibold text-slate-800">Brand company</p>
                            <p>{brand?.companyName ?? "Not extracted yet"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">Brand assets</p>
                            <p>{brand?.assets ?? 0}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">Visual confidence</p>
                            <p>{brand?.confidence === null || brand?.confidence === undefined ? "Unknown" : `${Math.round(brand.confidence * 100)}%`}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">Brand synced</p>
                            <p>{formatDateTime(brand?.syncedAt ?? null)}</p>
                          </div>
                        </div>
                      )}

                      {!latestRun ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
                          No run history yet.
                        </div>
                      ) : (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <p className="font-semibold text-slate-800">Latest run</p>
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 font-semibold ${getStatusBadgeClass(latestRun.status)}`}
                            >
                              {formatStatusLabel(latestRun.status)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">Started {formatDateTime(latestRun.started_at ?? latestRun.created_at)}</p>
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-900">
                              Done: {stepSummary?.succeeded ?? 0}
                            </span>
                            <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900">
                              Active: {stepSummary?.active ?? 0}
                            </span>
                            <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-900">
                              Failed: {stepSummary?.failed ?? 0}
                            </span>
                          </div>
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="flex justify-end gap-2">
                      <Link to={`/projects/${project.id}`} className="inline-flex">
                        <Button variant="outline">Project details</Button>
                      </Link>
                      <Link to={`/projects/${project.id}/discovery`} className="inline-flex">
                        <Button variant="outline">Open discovery</Button>
                      </Link>
                      <Link to={`/projects/${project.id}/creation`} className="inline-flex">
                        <Button variant="outline">Open creation</Button>
                      </Link>
                    </CardFooter>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {projects.length > 0 ? null : (
        <section className="grid gap-2 md:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </section>
      )}
    </div>
  );
}

function BrandSetupProgress({
  projectId,
  setupRunId,
  initialStatus,
}: {
  projectId: string;
  setupRunId: string;
  initialStatus: string;
}) {
  const progressFetcher = useFetcher<PipelineProgressResponse>();
  const effectiveStatus = String(progressFetcher.data?.status ?? initialStatus ?? "").toLowerCase();
  const stepName = progressFetcher.data?.current_step_name ?? null;
  const progress = Math.max(0, Math.min(100, Math.round(progressFetcher.data?.overall_progress ?? 0)));
  const statusRef = useRef(effectiveStatus);
  const fetcherStateRef = useRef(progressFetcher.state);

  useEffect(() => {
    statusRef.current = effectiveStatus;
  }, [effectiveStatus]);

  useEffect(() => {
    fetcherStateRef.current = progressFetcher.state;
  }, [progressFetcher.state]);

  useEffect(() => {
    let intervalId: number | null = null;

    const poll = () => {
      if (fetcherStateRef.current !== "idle") return;

      if (isTerminalStatus(statusRef.current)) {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }

      progressFetcher.load(`/projects/${projectId}/progress/${setupRunId}?ts=${Date.now()}`);
    };

    poll();
    intervalId = window.setInterval(poll, 3000);
    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [projectId, setupRunId]);

  return (
    <div className="space-y-3 rounded-xl border border-[#2f6f71]/30 bg-gradient-to-r from-[#f0f6f5] to-[#eef1f8] p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">Brand profile is on the way</p>
        <span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${getStatusBadgeClass(effectiveStatus || initialStatus)}`}>
          {formatStatusLabel(effectiveStatus || initialStatus)}
        </span>
      </div>

      {progressFetcher.data ? (
        <>
          <div className="space-y-1">
            <p className="text-slate-600">{stepName ? `Current step: ${stepName}` : "Preparing brand extraction pipeline..."}</p>
            <Progress value={progress} />
          </div>
          <p className="text-right font-semibold text-[#1e5052]">{progress}%</p>
        </>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      )}
    </div>
  );
}
