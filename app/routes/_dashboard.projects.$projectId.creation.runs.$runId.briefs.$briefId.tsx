import { Link, data, redirect, useLoaderData } from "react-router";
import { RefreshCw } from "lucide-react";
import type { Route } from "./+types/_dashboard.projects.$projectId.creation.runs.$runId.briefs.$briefId";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { ArticleViewer, ArticleLoadingState, ArticleEmptyState } from "~/components/article-viewer";
import { ApiClient } from "~/lib/api.server";
import { formatDateTime, isRunActive } from "~/lib/dashboard";
import { fetchJson } from "~/lib/pipeline-run.server";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type ContentBriefDetailResponse = components["schemas"]["ContentBriefDetailResponse"];
type ContentArticleDetailResponse = components["schemas"]["ContentArticleDetailResponse"];

type LoaderData = {
  project: ProjectResponse;
  selectedRun: PipelineRunResponse;
  brief: ContentBriefDetailResponse;
  article: ContentArticleDetailResponse | null;
  runIsActive: boolean;
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
  const briefId = params.briefId;

  if (!projectId || !runId || !briefId) {
    throw new Response("Missing route parameters.", { status: 400 });
  }

  const api = new ApiClient(request);

  const [projectResult, runResult, briefResult] = await Promise.all([
    fetchJson<ProjectResponse>(api, `/projects/${projectId}`),
    fetchJson<PipelineRunResponse>(api, `/pipeline/${projectId}/runs/${runId}`),
    fetchJson<ContentBriefDetailResponse>(api, `/content/${projectId}/briefs/${briefId}`),
  ]);

  if (projectResult.unauthorized || runResult.unauthorized || briefResult.unauthorized) {
    return handleUnauthorized(api);
  }

  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  if (!runResult.ok || !runResult.data) {
    throw new Response("Failed to load run.", { status: runResult.status });
  }

  if (!briefResult.ok || !briefResult.data) {
    return redirect(`/projects/${projectId}/creation/runs/${runId}`, {
      headers: await api.commit(),
    });
  }

  // Fetch article for this brief — may 404 if not yet generated
  let article: ContentArticleDetailResponse | null = null;
  const articleResult = await fetchJson<ContentArticleDetailResponse>(
    api,
    `/content/${projectId}/briefs/${briefId}/article`,
  );
  if (articleResult.unauthorized) return handleUnauthorized(api);
  if (articleResult.ok && articleResult.data) {
    article = articleResult.data;
  }

  return data(
    {
      project: projectResult.data,
      selectedRun: runResult.data,
      brief: briefResult.data,
      article,
      runIsActive: isRunActive(runResult.data.status),
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    },
  );
}

export default function ProjectCreationBriefDetailRoute() {
  const { project, selectedRun, brief, article, runIsActive } = useLoaderData<typeof loader>() as LoaderData;

  return (
    <div className="mx-auto max-w-[1240px] space-y-6">
      {/* Article section */}
      <section className="mx-auto w-full max-w-[1120px]">
        <Card className="overflow-hidden border border-slate-200 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)]">
          <div className="border-b border-slate-200 bg-gradient-to-r from-white via-[#f4f5fb] to-[#eef4ff] px-4 py-4 sm:px-6 lg:px-10 lg:py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4b5e9f]">Content brief</p>
                <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 md:text-3xl">
                  {brief.primary_keyword}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {brief.page_type ?? "Unknown type"} · {brief.funnel_stage ?? "Unknown stage"} · Run{" "}
                  {selectedRun.id.slice(0, 8)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link to={`/projects/${project.id}/creation/runs/${selectedRun.id}`}>
                  <Button variant="outline">Back to run</Button>
                </Link>
                <Link to={`/projects/${project.id}/creation`}>
                  <Button variant="outline">Overview</Button>
                </Link>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200/80 pt-3">
              <h2 className="font-display text-xl font-bold text-slate-900 lg:text-2xl">Article preview</h2>
              {article ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Badge variant="success">v{article.current_version}</Badge>
                  <span>{formatDateTime(article.generated_at)}</span>
                  {article.generation_model ? (
                    <span className="text-xs text-slate-400">({article.generation_model})</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {article && !runIsActive ? (
            /* Article exists, run done */
            <CardContent className="px-4 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5 lg:px-10">
              <ArticleViewer document={article.modular_document} />
            </CardContent>
          ) : article && runIsActive ? (
            /* Article exists, run still active */
            <CardContent className="space-y-4 px-4 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5 lg:px-10">
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                <p className="font-medium text-amber-800">Article may still be updating. Pipeline is running.</p>
              </div>
              <ArticleViewer document={article.modular_document} />
            </CardContent>
          ) : !article && runIsActive ? (
            /* No article yet, run still active */
            <CardContent className="space-y-4 px-4 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5 lg:px-10">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                <div>
                  <p className="font-semibold text-slate-900">Article is being generated</p>
                  <p className="text-sm text-slate-500">The pipeline is still processing this brief.</p>
                </div>
              </div>
              <ArticleLoadingState />
            </CardContent>
          ) : (
            /* No article, run done */
            <CardContent className="px-4 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5 lg:px-10">
              <ArticleEmptyState />
            </CardContent>
          )}
        </Card>
      </section>
    </div>
  );
}
