import { Link, data, redirect, useLoaderData } from "react-router";
import { RefreshCw } from "lucide-react";
import type { Route } from "./+types/_dashboard.projects.$projectId.creation.runs.$runId.briefs.$briefId";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { ArticleViewer, ArticleEmptyState } from "~/components/article-viewer";
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

type KeywordCoverageSummary = {
  scorePercent: number | null;
  coveredCount: number | null;
  totalCount: number | null;
  missingKeywords: string[];
  details: Array<{ key: string; value: string }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = asFiniteNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) continue;
    const values = candidate
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
    if (values.length > 0) return values;
  }
  return [];
}

function formatConfidencePercent(value: number | null | undefined): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const rawPercent = value <= 1 ? value * 100 : value;
  const normalized = Math.max(0, Math.min(100, rawPercent));
  return `${Math.round(normalized)}% confidence`;
}

function parseKeywordCoverage(qaReport: Record<string, unknown> | null | undefined): KeywordCoverageSummary | null {
  if (!qaReport) return null;
  const coverage = asRecord(qaReport.keyword_coverage);
  if (!coverage) return null;

  const score = pickNumber(coverage, ["coverage_percent", "coverage_score", "score", "score_percent", "ratio"]);
  const scorePercent = score === null ? null : score <= 1 ? score * 100 : score;
  const coveredCount = pickNumber(coverage, ["covered_count", "covered_keywords_count", "matched_count"]);
  const totalCount = pickNumber(coverage, ["total_count", "total_keywords_count", "target_keywords_count"]);
  const missingKeywords = pickStringArray(coverage, ["missing_keywords", "missing_terms", "uncovered_keywords"]);

  const details = Object.entries(coverage)
    .map(([key, value]) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return { key, value: String(value) };
      }
      if (Array.isArray(value)) return { key, value: `${value.length} items` };
      if (typeof value === "object") return { key, value: "object" };
      return null;
    })
    .filter((entry): entry is { key: string; value: string } => Boolean(entry))
    .slice(0, 4);

  if (scorePercent === null && coveredCount === null && totalCount === null && missingKeywords.length === 0 && details.length === 0) {
    return null;
  }

  return {
    scorePercent,
    coveredCount,
    totalCount,
    missingKeywords,
    details,
  };
}

function PillarBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
}

function ArticleInsightsPanel({ article }: { article: ContentArticleDetailResponse }) {
  const keywordCoverage = parseKeywordCoverage(asRecord(article.qa_report));

  if (!keywordCoverage) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Keyword coverage</p>
      <div className="mt-2 space-y-1 text-sm text-slate-700">
        {keywordCoverage.scorePercent !== null ? (
          <p>
            Coverage score: <span className="font-semibold">{Math.round(keywordCoverage.scorePercent)}%</span>
          </p>
        ) : null}
        {keywordCoverage.coveredCount !== null && keywordCoverage.totalCount !== null ? (
          <p>
            Covered keywords:{" "}
            <span className="font-semibold">
              {Math.round(keywordCoverage.coveredCount)} / {Math.round(keywordCoverage.totalCount)}
            </span>
          </p>
        ) : null}
        {keywordCoverage.missingKeywords.length > 0 ? (
          <div className="pt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Missing</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {keywordCoverage.missingKeywords.slice(0, 6).map((keyword) => (
                <span key={keyword} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {keywordCoverage.scorePercent === null &&
        keywordCoverage.coveredCount === null &&
        keywordCoverage.totalCount === null &&
        keywordCoverage.missingKeywords.length === 0 ? (
          <div className="pt-1 text-xs text-slate-500">
            {keywordCoverage.details.map((detail) => (
              <p key={detail.key}>
                {detail.key}: {detail.value}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
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
  const pillarConfidenceLabel = formatConfidencePercent(article?.pillar_assignment_confidence);

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
            {article && (article.primary_pillar || (article.secondary_pillars?.length ?? 0) > 0) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {article.primary_pillar ? <PillarBadge label={`Primary pillar: ${article.primary_pillar.name}`} /> : null}
                {(article.secondary_pillars ?? []).map((pillar) => (
                  <PillarBadge key={pillar.id} label={`Secondary: ${pillar.name}`} />
                ))}
                {pillarConfidenceLabel ? <span className="text-xs text-slate-500">{pillarConfidenceLabel}</span> : null}
              </div>
            ) : null}
          </div>

          {article && !runIsActive ? (
            /* Article exists, run done */
            <CardContent className="space-y-4 px-4 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5 lg:px-10">
              <ArticleInsightsPanel article={article} />
              <ArticleViewer document={article.modular_document} />
            </CardContent>
          ) : article && runIsActive ? (
            /* Article exists, run still active */
            <CardContent className="space-y-4 px-4 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5 lg:px-10">
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                <p className="font-medium text-amber-800">Article may still be updating. Pipeline is running.</p>
              </div>
              <ArticleInsightsPanel article={article} />
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
