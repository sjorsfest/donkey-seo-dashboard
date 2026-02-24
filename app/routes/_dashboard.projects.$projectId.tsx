import { useEffect, useRef, useState } from "react";
import { Link, data, redirect, useFetcher, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import { ApiClient } from "~/lib/api.server";
import { formatDateTime, formatStatusLabel, getStatusBadgeClass, summarizeSteps } from "~/lib/dashboard";
import { sortPipelineRunsNewest } from "~/lib/pipeline-module";
import { fetchJson } from "~/lib/pipeline-run.server";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type KeywordListResponse = components["schemas"]["KeywordListResponse"];
type TopicListResponse = components["schemas"]["TopicListResponse"];
type TopicResponse = components["schemas"]["TopicResponse"];
type BrandVisualContextResponse = components["schemas"]["BrandVisualContextResponse"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];

type SetupRunSummary = {
  id: string;
  status: string;
};

type LoaderData = {
  project: ProjectResponse;
  runs: PipelineRunResponse[];
  latestRun: PipelineRunResponse | null;
  latestSetupRun: SetupRunSummary | null;
  keywordTotal: number;
  topicTotal: number;
  rankedTopicCount: number;
  brand: BrandVisualContextResponse | null;
  brandAssetRoles: Array<{ role: string; count: number }>;
};

function countBrandAssetRoles(brand: BrandVisualContextResponse | null) {
  if (!brand?.brand_assets || brand.brand_assets.length === 0) return [];
  const counts = new Map<string, number>();
  for (const asset of brand.brand_assets) {
    const role = asset.role || "unknown";
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);
}

async function handleUnauthorized(api: ApiClient) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

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

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  if (!projectId) {
    throw new Response("Missing project id.", { status: 400 });
  }

  const api = new ApiClient(request);

  const [projectResult, runsResult, keywordsResult, topicsResult, rankedTopicsResult, brandResult] = await Promise.all([
    fetchJson<ProjectResponse>(api, `/projects/${projectId}`),
    fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=20`),
    fetchJson<KeywordListResponse>(api, `/keywords/${projectId}?page=1&page_size=1`),
    fetchJson<TopicListResponse>(api, `/topics/${projectId}?page=1&page_size=1&eligibility=all`),
    fetchJson<TopicResponse[]>(api, `/topics/${projectId}/ranked?limit=50`),
    fetchJson<BrandVisualContextResponse>(api, `/brand/${projectId}/visual-context`),
  ]);

  if (
    projectResult.unauthorized ||
    runsResult.unauthorized ||
    keywordsResult.unauthorized ||
    topicsResult.unauthorized ||
    rankedTopicsResult.unauthorized ||
    brandResult.unauthorized
  ) {
    return handleUnauthorized(api);
  }

  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  const runs = sortPipelineRunsNewest(runsResult.ok && runsResult.data ? runsResult.data : []);
  const latestRun = runs[0] ?? null;
  const latestSetup = runs.find((run) => String(run.pipeline_module ?? "").toLowerCase() === "setup") ?? null;
  const brand = brandResult.ok && brandResult.data ? brandResult.data : null;
  const brandAssetRoles = countBrandAssetRoles(brand);

  return data(
    {
      project: projectResult.data,
      runs,
      latestRun,
      latestSetupRun: latestSetup
        ? ({
            id: latestSetup.id,
            status: latestSetup.status,
          } satisfies SetupRunSummary)
        : null,
      keywordTotal: keywordsResult.ok && keywordsResult.data ? keywordsResult.data.total : 0,
      topicTotal: topicsResult.ok && topicsResult.data ? topicsResult.data.total : 0,
      rankedTopicCount: rankedTopicsResult.ok && rankedTopicsResult.data ? rankedTopicsResult.data.length : 0,
      brand,
      brandAssetRoles,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export default function ProjectDetailsRoute() {
  const { project, runs, latestRun, latestSetupRun, keywordTotal, topicTotal, rankedTopicCount, brand, brandAssetRoles } =
    useLoaderData<typeof loader>() as LoaderData;
  const revalidator = useRevalidator();
  const setupProgressFetcher = useFetcher<PipelineProgressResponse>();
  const [didRevalidateAfterSetup, setDidRevalidateAfterSetup] = useState(false);

  const latestStepSummary = latestRun ? summarizeSteps(latestRun.step_executions ?? []) : null;
  const discoveryRuns = runs.filter((run) => String(run.pipeline_module ?? "").toLowerCase() === "discovery").length;
  const contentRuns = runs.filter((run) => String(run.pipeline_module ?? "").toLowerCase() === "content").length;
  const setupRuns = runs.filter((run) => String(run.pipeline_module ?? "").toLowerCase() === "setup").length;
  const setupStatus = String(setupProgressFetcher.data?.status ?? latestSetupRun?.status ?? "").toLowerCase();
  const isSetupActive = !brand && Boolean(latestSetupRun && isActiveStatus(setupStatus));
  const setupProgress = Math.max(0, Math.min(100, Math.round(setupProgressFetcher.data?.overall_progress ?? 0)));
  const setupStepName = setupProgressFetcher.data?.current_step_name ?? null;
  const setupStatusRef = useRef(setupStatus);
  const fetcherStateRef = useRef(setupProgressFetcher.state);

  useEffect(() => {
    setupStatusRef.current = setupStatus;
  }, [setupStatus]);

  useEffect(() => {
    fetcherStateRef.current = setupProgressFetcher.state;
  }, [setupProgressFetcher.state]);

  useEffect(() => {
    if (!latestSetupRun || brand) return;
    let intervalId: number | null = null;

    const poll = () => {
      if (fetcherStateRef.current !== "idle") return;

      if (isTerminalStatus(setupStatusRef.current)) {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }

      setupProgressFetcher.load(`/projects/${project.id}/progress/${latestSetupRun.id}?ts=${Date.now()}`);
    };

    poll();
    intervalId = window.setInterval(poll, 2000);
    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [brand, latestSetupRun?.id, project.id]);

  useEffect(() => {
    if (brand || !latestSetupRun || didRevalidateAfterSetup) return;
    if (setupStatus !== "completed" || revalidator.state !== "idle") return;

    setDidRevalidateAfterSetup(true);
    revalidator.revalidate();
  }, [brand, didRevalidateAfterSetup, latestSetupRun, revalidator, setupStatus]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0f6f5] to-[#eef1f8] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Project details</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600">{project.domain}</p>
          </div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${getStatusBadgeClass(project.status)}`}>
            {formatStatusLabel(project.status)}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/project" className="inline-flex">
            <Button variant="outline">Back to project</Button>
          </Link>
          <Link to={`/projects/${project.id}/discovery`} className="inline-flex">
            <Button variant="outline">Open discovery</Button>
          </Link>
          <Link to={`/projects/${project.id}/creation`} className="inline-flex">
            <Button variant="outline">Open creation</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Summary statistics</CardTitle>
            <CardDescription>Project-level snapshot across setup, discovery, and content activity.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Keywords</p>
              <p className="font-display text-2xl font-bold text-slate-900">{keywordTotal}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Topics</p>
              <p className="font-display text-2xl font-bold text-slate-900">{topicTotal}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Ranked topics</p>
              <p className="font-display text-2xl font-bold text-slate-900">{rankedTopicCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Total runs</p>
              <p className="font-display text-2xl font-bold text-slate-900">{runs.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Discovery runs</p>
              <p className="font-display text-2xl font-bold text-slate-900">{discoveryRuns}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Content runs</p>
              <p className="font-display text-2xl font-bold text-slate-900">{contentRuns}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brand profile</CardTitle>
            <CardDescription>Visual brand context extracted during setup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {brand ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Company</p>
                    <p className="font-semibold text-slate-900">{brand.company_name ?? "Unknown"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Brand assets</p>
                    <p className="font-semibold text-slate-900">{brand.brand_assets?.length ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Extraction confidence</p>
                    <p className="font-semibold text-slate-900">
                      {brand.visual_extraction_confidence === null || brand.visual_extraction_confidence === undefined
                        ? "Unknown"
                        : `${Math.round(brand.visual_extraction_confidence * 100)}%`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Last sync</p>
                    <p className="font-semibold text-slate-900">{formatDateTime(brand.visual_last_synced_at ?? null)}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Asset roles</p>
                  {brandAssetRoles.length === 0 ? (
                    <p className="text-slate-600">No role metadata available yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {brandAssetRoles.map((entry) => (
                        <Badge key={entry.role} variant="default">
                          {entry.role}: {entry.count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : isSetupActive && latestSetupRun ? (
              <div className="space-y-3 rounded-2xl border border-[#2f6f71]/30 bg-gradient-to-r from-[#f0f6f5] to-[#eef1f8] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">Building brand profile</p>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(setupStatus)}`}>
                    {formatStatusLabel(setupStatus)}
                  </span>
                </div>

                {setupProgressFetcher.data ? (
                  <>
                    <p className="text-slate-600">{setupStepName ? `Current step: ${setupStepName}` : "Running setup tasks..."}</p>
                    <Progress value={setupProgress} className="h-2.5" />
                    <p className="text-right text-xs font-semibold text-[#1e5052]">{setupProgress}%</p>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-2.5 w-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                </div>
              </div>
            ) : (
              <p className="text-slate-600">Brand profile is not available yet. Finish setup to extract visual context.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest run health</CardTitle>
            <CardDescription>Most recent pipeline run status and execution summary.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!latestRun ? (
              <p className="text-slate-600">No run history yet.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">Status</p>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(latestRun.status)}`}>
                    {formatStatusLabel(latestRun.status)}
                  </span>
                </div>
                <p>
                  <span className="font-semibold text-slate-900">Module:</span> {latestRun.pipeline_module}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Started:</span>{" "}
                  {formatDateTime(latestRun.started_at ?? latestRun.created_at)}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="default">Done: {latestStepSummary?.succeeded ?? 0}</Badge>
                  <Badge variant="default">Active: {latestStepSummary?.active ?? 0}</Badge>
                  <Badge variant="default">Failed: {latestStepSummary?.failed ?? 0}</Badge>
                  <Badge variant="default">Setup runs: {setupRuns}</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
