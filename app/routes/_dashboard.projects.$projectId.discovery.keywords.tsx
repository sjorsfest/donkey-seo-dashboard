import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Link, data, redirect, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId.discovery.keywords";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Drawer } from "~/components/ui/drawer";
import { Select } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { ApiClient } from "~/lib/api.server";
import { fetchJson } from "~/lib/pipeline-run.server";
import { buildKeywordGraph } from "~/lib/keyword-graph";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type KeywordListResponse = components["schemas"]["KeywordListResponse"];
type KeywordResponse = components["schemas"]["KeywordResponse"];
type KeywordDetailResponse = components["schemas"]["KeywordDetailResponse"];
type TopicListResponse = components["schemas"]["TopicListResponse"];
type TopicResponse = components["schemas"]["TopicResponse"];

type LoaderData = {
  project: ProjectResponse;
  keywords: KeywordResponse[];
  topics: TopicResponse[];
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
  if (!projectId) {
    throw new Response("Missing project id.", { status: 400 });
  }

  const api = new ApiClient(request);

  const projectResult = await fetchJson<ProjectResponse>(api, `/projects/${projectId}`);
  if (projectResult.unauthorized) return handleUnauthorized(api);
  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  const [keywordsResult, topicsResult] = await Promise.all([
    fetchJson<KeywordListResponse>(api, `/keywords/${projectId}?page=1&page_size=200`),
    fetchJson<TopicListResponse>(api, `/topics/${projectId}?page=1&page_size=200&eligibility=all`),
  ]);

  if (keywordsResult.unauthorized || topicsResult.unauthorized) return handleUnauthorized(api);

  return data(
    {
      project: projectResult.data,
      keywords: keywordsResult.ok && keywordsResult.data ? keywordsResult.data.items ?? [] : [],
      topics: topicsResult.ok && topicsResult.data ? topicsResult.data.items ?? [] : [],
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export default function DiscoveryKeywordsRoute() {
  const { project, keywords, topics } = useLoaderData<typeof loader>() as LoaderData;
  const keywordDetailFetcher = useFetcher<KeywordDetailResponse>();

  const [keywordSearch, setKeywordSearch] = useState("");
  const [keywordStatusFilter, setKeywordStatusFilter] = useState("all");
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);

  const filteredKeywords = useMemo(() => {
    return keywords.filter((keyword) => {
      const matchesSearch = keyword.keyword.toLowerCase().includes(keywordSearch.trim().toLowerCase());
      const matchesStatus = keywordStatusFilter === "all" || keyword.status === keywordStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [keywordSearch, keywordStatusFilter, keywords]);

  const tableKeywords = useMemo(() => {
    return filteredKeywords
      .slice()
      .sort((a, b) => (b.search_volume ?? -1) - (a.search_volume ?? -1));
  }, [filteredKeywords]);

  const graphEligible = keywords.length >= 20 && topics.length >= 3;

  const { nodes: keywordGraphNodes, edges: keywordGraphEdges } = useMemo(() => {
    return buildKeywordGraph(filteredKeywords, topics);
  }, [filteredKeywords, topics]);

  const selectedKeywordSummary = useMemo(
    () => keywords.find((keyword) => keyword.id === selectedKeywordId) ?? null,
    [keywords, selectedKeywordId]
  );

  const onGraphNodeClick: NodeMouseHandler = (_event, node) => {
    const keywordId =
      typeof node.data === "object" && node.data && "keywordId" in node.data
        ? String((node.data as Record<string, unknown>).keywordId ?? "")
        : "";

    if (!keywordId) return;

    setSelectedKeywordId(keywordId);
    keywordDetailFetcher.load(`/projects/${project.id}/keyword-detail/${keywordId}`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0f6f5] to-[#ecf2fb] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Keywords</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Search, filter, and explore the keywords discovered for this project.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/projects/${project.id}/discovery`}>
              <Button variant="outline">Back to overview</Button>
            </Link>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Keyword snapshot</CardTitle>
          <CardDescription>Inspect current keyword state. Graph unlocks at 20+ keywords and 3+ topics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
            <input
              type="text"
              value={keywordSearch}
              onChange={(event) => setKeywordSearch(event.target.value)}
              placeholder="Search keywords"
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm"
            />
            <Select value={keywordStatusFilter} onChange={(event) => setKeywordStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {Array.from(new Set(keywords.map((keyword) => keyword.status))).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="font-semibold text-slate-900">Total keywords</p>
              <p>{keywords.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="font-semibold text-slate-900">Topics connected</p>
              <p>{topics.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="font-semibold text-slate-900">Filtered</p>
              <p>{filteredKeywords.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {graphEligible ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle>Keyword cluster graph</CardTitle>
              <CardDescription>
                Dark nodes are topics. Seed keywords are highlighted. Click a keyword node for detail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[540px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <ReactFlow
                  nodes={keywordGraphNodes}
                  edges={keywordGraphEdges}
                  fitView
                  minZoom={0.3}
                  maxZoom={1.4}
                  onNodeClick={onGraphNodeClick}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable
                  proOptions={{ hideAttribution: true }}
                >
                  <MiniMap pannable zoomable />
                  <Controls />
                  <Background gap={24} color="#dbe4ef" />
                </ReactFlow>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-slate-600">
              Graph locked for now. Add more pipeline output to unlock the relationship map (20+ keywords and 3+
              topics required).
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Keyword table</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Topic</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableKeywords.slice(0, 80).map((keyword) => (
                <TableRow key={keyword.id}>
                  <TableCell className="font-medium text-slate-900">{keyword.keyword}</TableCell>
                  <TableCell>{keyword.status}</TableCell>
                  <TableCell>{keyword.intent ?? "-"}</TableCell>
                  <TableCell>{keyword.search_volume ?? "-"}</TableCell>
                  <TableCell>{keyword.difficulty ?? "-"}</TableCell>
                  <TableCell>{topics.find((topic) => topic.id === keyword.topic_id)?.name ?? "Unassigned"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Drawer
        open={selectedKeywordId !== null}
        onClose={() => setSelectedKeywordId(null)}
        title={selectedKeywordSummary?.keyword ?? "Keyword detail"}
        description="Deep detail for trend, risk, and SERP context"
      >
        {keywordDetailFetcher.state === "loading" ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : keywordDetailFetcher.data ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-100 p-2">
                <p className="text-xs text-slate-500">Search volume</p>
                <p className="font-semibold text-slate-900">{keywordDetailFetcher.data.search_volume ?? "-"}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2">
                <p className="text-xs text-slate-500">Difficulty</p>
                <p className="font-semibold text-slate-900">{keywordDetailFetcher.data.difficulty ?? "-"}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2">
                <p className="text-xs text-slate-500">Intent</p>
                <p className="font-semibold text-slate-900">{keywordDetailFetcher.data.intent ?? "-"}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2">
                <p className="text-xs text-slate-500">Priority score</p>
                <p className="font-semibold text-slate-900">{keywordDetailFetcher.data.priority_score ?? "-"}</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk flags</p>
              <p className="mt-1 text-sm text-slate-700">
                {keywordDetailFetcher.data.risk_flags?.join(", ") || "No risk flags"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SERP features</p>
              <p className="mt-1 text-sm text-slate-700">
                {keywordDetailFetcher.data.serp_features?.join(", ") || "No SERP feature data"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trend data</p>
              <p className="mt-1 text-sm text-slate-700">
                {keywordDetailFetcher.data.trend_data?.join(" • ") || "No trend data"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Select a keyword node from the graph.</p>
        )}
      </Drawer>
    </div>
  );
}
