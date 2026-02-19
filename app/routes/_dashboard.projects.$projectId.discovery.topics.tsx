import type { ReactNode } from "react";
import { Link, data, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId.discovery.topics";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ApiClient } from "~/lib/api.server";
import { fetchJson } from "~/lib/pipeline-run.server";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type TopicListResponse = components["schemas"]["TopicListResponse"];
type TopicResponse = components["schemas"]["TopicResponse"];
type TopicHierarchyResponse = components["schemas"]["TopicHierarchyResponse"];

type LoaderData = {
  project: ProjectResponse;
  topics: TopicResponse[];
  rankedTopics: TopicResponse[];
  topicHierarchy: TopicHierarchyResponse[];
};

function hasNestedHierarchy(topics: TopicHierarchyResponse[]) {
  return topics.some((topic) => topic.children.length > 0);
}

function renderHierarchyNodes(nodes: TopicHierarchyResponse[], depth = 0): ReactNode {
  if (nodes.length === 0) return null;

  return (
    <ul className="space-y-2">
      {nodes.map((node) => (
        <li key={node.id}>
          <div
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            style={{ marginLeft: depth * 12 }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-900">{node.name}</span>
              <span className="text-xs text-slate-500">{node.keyword_count} keywords</span>
            </div>
            {node.priority_rank !== null ? (
              <p className="text-xs text-slate-500">Priority rank: #{node.priority_rank}</p>
            ) : null}
          </div>
          {node.children.length > 0 ? renderHierarchyNodes(node.children, depth + 1) : null}
        </li>
      ))}
    </ul>
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
  if (!projectId) {
    throw new Response("Missing project id.", { status: 400 });
  }

  const api = new ApiClient(request);

  const projectResult = await fetchJson<ProjectResponse>(api, `/projects/${projectId}`);
  if (projectResult.unauthorized) return handleUnauthorized(api);
  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  const [topicsResult, rankedTopicsResult, hierarchyResult] = await Promise.all([
    fetchJson<TopicListResponse>(api, `/topics/${projectId}?page=1&page_size=200&eligibility=all`),
    fetchJson<TopicResponse[]>(api, `/topics/${projectId}/ranked?limit=30`),
    fetchJson<TopicHierarchyResponse[]>(api, `/topics/${projectId}/hierarchy`),
  ]);

  if (topicsResult.unauthorized || rankedTopicsResult.unauthorized || hierarchyResult.unauthorized) {
    return handleUnauthorized(api);
  }

  return data(
    {
      project: projectResult.data,
      topics: topicsResult.ok && topicsResult.data ? topicsResult.data.items ?? [] : [],
      rankedTopics: rankedTopicsResult.ok && rankedTopicsResult.data ? rankedTopicsResult.data : [],
      topicHierarchy: hierarchyResult.ok && hierarchyResult.data ? hierarchyResult.data : [],
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export default function DiscoveryTopicsRoute() {
  const { project, topics, rankedTopics, topicHierarchy } = useLoaderData<typeof loader>() as LoaderData;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0f6f5] to-[#ecf2fb] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Topics</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Ranked topic backlog and cluster hierarchy for this project.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/projects/${project.id}/discovery`}>
              <Button variant="outline">Back to overview</Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-900">Total topics</p>
          <p>{topics.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-900">Ranked</p>
          <p>{rankedTopics.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-900">Hierarchy</p>
          <p>{hasNestedHierarchy(topicHierarchy) ? "Nested" : "Flat"}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prioritized topic backlog</CardTitle>
          <CardDescription>Focus your publish queue on highest value topics first.</CardDescription>
        </CardHeader>
        <CardContent>
          {rankedTopics.length === 0 ? (
            <p className="text-sm text-slate-500">No ranked topics yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {rankedTopics.map((topic) => (
                <div key={topic.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-900">{topic.name}</p>
                  <p className="text-xs text-slate-500">Keywords: {topic.keyword_count}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    {topic.priority_rank !== null ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-1 font-semibold text-indigo-900">
                        Rank #{topic.priority_rank}
                      </span>
                    ) : null}
                    {topic.fit_score !== null ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-900">
                        Fit {topic.fit_score}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hasNestedHierarchy(topicHierarchy) ? (
        <Card>
          <CardHeader>
            <CardTitle>Topic hierarchy</CardTitle>
            <CardDescription>Nested view of topic clusters and parent-child relationships.</CardDescription>
          </CardHeader>
          <CardContent>{renderHierarchyNodes(topicHierarchy)}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
