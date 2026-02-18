import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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
import type { Route } from "./+types/_dashboard.projects.$projectId.discovery.runs.$runId";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Drawer } from "~/components/ui/drawer";
import { Progress } from "~/components/ui/progress";
import { Select } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ApiClient } from "~/lib/api.server";
import {
  formatDateTime,
  formatStatusLabel,
  getStatusBadgeClass,
  isRunActive,
  isRunFailed,
  isRunPaused,
  summarizeSteps,
} from "~/lib/dashboard";
import { fetchJson, classifyPipelineRuns } from "~/lib/pipeline-run.server";
import { isPhaseMatch, pickLatestRunForPhase, type ClassifiedPipelineRun } from "~/lib/pipeline-phase";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];
type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];
type StepExecutionResponse = components["schemas"]["StepExecutionResponse"];
type KeywordListResponse = components["schemas"]["KeywordListResponse"];
type KeywordResponse = components["schemas"]["KeywordResponse"];
type KeywordDetailResponse = components["schemas"]["KeywordDetailResponse"];
type TopicListResponse = components["schemas"]["TopicListResponse"];
type TopicResponse = components["schemas"]["TopicResponse"];
type TopicHierarchyResponse = components["schemas"]["TopicHierarchyResponse"];
type DiscoveryTopicSnapshotResponse = components["schemas"]["DiscoveryTopicSnapshotResponse"];

type StepTimelineRow = {
  stepNumber: number;
  stepName: string;
  latest: StepExecutionResponse;
  attempts: StepExecutionResponse[];
  historicalFailureCount: number;
};

type LoaderData = {
  project: ProjectResponse;
  runs: ClassifiedPipelineRun[];
  selectedRun: PipelineRunResponse;
  progress: PipelineProgressResponse | null;
  stepFocus: number | null;
  keywords: KeywordResponse[];
  topics: TopicResponse[];
  rankedTopics: TopicResponse[];
  topicHierarchy: TopicHierarchyResponse[];
  discoverySnapshots: DiscoveryTopicSnapshotResponse[];
};

type ActionData = {
  error?: string;
};

const STEP_FOCUS_PATTERN = /\/steps\/([^/]+)$/;

function parseStepFocusFromPathname(pathname: string) {
  const match = pathname.match(STEP_FOCUS_PATTERN);
  if (!match) return { hasStepPath: false, stepFocus: null as number | null };

  const parsed = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return { hasStepPath: true, stepFocus: null as number | null };
  }

  return { hasStepPath: true, stepFocus: parsed };
}

function formatStepName(value: string | null | undefined) {
  if (!value) return "Unnamed Step";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function formatStepItems(step: StepExecutionResponse) {
  return step.items_total === null
    ? `${step.items_processed} items processed`
    : `${step.items_processed}/${step.items_total} items processed`;
}

function getStepExecutionTimestamp(step: StepExecutionResponse) {
  const value = step.completed_at ?? step.started_at;
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isAcceptedDecision(decision: string | null | undefined) {
  const normalized = String(decision ?? "").toLowerCase();
  return normalized.includes("accept") || normalized.includes("approved") || normalized.includes("selected");
}

function isRejectedDecision(decision: string | null | undefined) {
  const normalized = String(decision ?? "").toLowerCase();
  return normalized.includes("reject") || normalized.includes("exclude") || normalized.includes("deny");
}

function calculateOverallProgress(steps: StepExecutionResponse[]) {
  if (steps.length === 0) return 0;
  const total = steps.reduce((acc, step) => acc + step.progress_percent, 0);
  return Math.round(total / steps.length);
}

function formatTimelineTimestamp(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimelineDotClass(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "running" || normalized === "in_progress" || normalized === "queued") {
    return "bg-amber-500";
  }
  if (normalized === "failed" || normalized === "error") {
    return "bg-rose-500";
  }
  if (normalized === "completed" || normalized === "success" || normalized === "succeeded" || normalized === "done") {
    return "bg-emerald-500";
  }
  return "bg-slate-400";
}

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

function toPhaseBadgeClass(phase: ClassifiedPipelineRun["phase"]) {
  if (phase === "discovery") return "border-teal-300 bg-teal-100 text-teal-900";
  if (phase === "creation") return "border-indigo-300 bg-indigo-100 text-indigo-900";
  if (phase === "mixed") return "border-amber-300 bg-amber-100 text-amber-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function toPhaseLabel(phase: ClassifiedPipelineRun["phase"]) {
  if (phase === "mixed") return "Mixed";
  if (phase === "unknown") return "Unknown";
  return phase === "discovery" ? "Discovery" : "Creation";
}

function buildKeywordGraph(keywords: KeywordResponse[], topics: TopicResponse[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const topicsForGraph = topics.slice(0, 24);
  const topicIdSet = new Set(topicsForGraph.map((topic) => topic.id));
  const scopedKeywords = keywords
    .filter((keyword) => (keyword.topic_id ? topicIdSet.has(keyword.topic_id) : true))
    .slice(0, 200);

  const topicPositions = new Map<string, { x: number; y: number }>();

  topicsForGraph.forEach((topic, index) => {
    const columns = 3;
    const x = 230 + (index % columns) * 380;
    const y = 170 + Math.floor(index / columns) * 280;

    topicPositions.set(topic.id, { x, y });

    nodes.push({
      id: `topic-${topic.id}`,
      position: { x, y },
      data: {
        label: (
          <div className="max-w-[180px] text-center">
            <p className="truncate text-xs font-bold uppercase tracking-wide">{topic.name}</p>
            <p className="text-[10px] text-slate-200">{topic.keyword_count} keywords</p>
          </div>
        ),
      },
      style: {
        background: "#1f2937",
        color: "#f8fafc",
        border: "1px solid #475569",
        borderRadius: 14,
        minWidth: 170,
        padding: 10,
      },
      draggable: false,
    });
  });

  const groupedByTopic = new Map<string, KeywordResponse[]>();

  for (const keyword of scopedKeywords) {
    if (!keyword.topic_id || !topicIdSet.has(keyword.topic_id)) continue;
    const current = groupedByTopic.get(keyword.topic_id) ?? [];
    current.push(keyword);
    groupedByTopic.set(keyword.topic_id, current);
  }

  for (const [topicId, group] of groupedByTopic.entries()) {
    const center = topicPositions.get(topicId);
    if (!center) continue;

    const seeds: KeywordResponse[] = [];
    const related: KeywordResponse[] = [];

    group.forEach((keyword) => {
      const source = String(keyword.source ?? "").toLowerCase();
      const isSeed = source.includes("manual") || source.includes("seed");
      if (isSeed) {
        seeds.push(keyword);
      } else {
        related.push(keyword);
      }
    });

    const orderedKeywords = [...seeds, ...related];

    orderedKeywords.forEach((keyword, index) => {
      const source = String(keyword.source ?? "").toLowerCase();
      const isSeed = source.includes("manual") || source.includes("seed");
      const angle = (index / Math.max(1, orderedKeywords.length)) * Math.PI * 2;
      const ring = Math.floor(index / 8);
      const radius = 130 + ring * 42;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      const metricSummary = `Volume: ${keyword.search_volume ?? "n/a"} | Difficulty: ${keyword.difficulty ?? "n/a"} | Intent: ${keyword.intent ?? "n/a"} | Priority: ${keyword.priority_score ?? "n/a"}`;

      nodes.push({
        id: `keyword-${keyword.id}`,
        position: { x, y },
        data: {
          label: (
            <span className="max-w-[160px] truncate text-[11px] font-semibold" title={metricSummary}>
              {keyword.keyword}
            </span>
          ),
          keywordId: keyword.id,
        },
        style: {
          borderRadius: 999,
          border: isSeed ? "2px solid #2f6f71" : "1px solid #94a3b8",
          background: isSeed ? "#e2f2f2" : "#ffffff",
          color: "#0f172a",
          minWidth: 110,
          maxWidth: 190,
          padding: "6px 10px",
        },
        draggable: false,
      });

      edges.push({
        id: `edge-topic-${keyword.id}`,
        source: `keyword-${keyword.id}`,
        target: `topic-${topicId}`,
        animated: false,
        style: { stroke: "#cbd5e1" },
      });
    });

    if (seeds.length > 0 && related.length > 0) {
      const primarySeed = seeds[0];
      for (const keyword of related) {
        if (keyword.id === primarySeed.id) continue;
        edges.push({
          id: `edge-seed-${primarySeed.id}-${keyword.id}`,
          source: `keyword-${primarySeed.id}`,
          target: `keyword-${keyword.id}`,
          style: { stroke: "#5f79a8", strokeDasharray: "4 3" },
        });
      }
    }
  }

  return { nodes, edges };
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

  if (!projectId || !runId) {
    throw new Response("Missing route parameters.", { status: 400 });
  }

  const url = new URL(request.url);
  const stepFocusParsed = parseStepFocusFromPathname(url.pathname);
  if (stepFocusParsed.hasStepPath && stepFocusParsed.stepFocus === null) {
    throw new Response("Invalid step number.", { status: 400 });
  }

  const api = new ApiClient(request);

  const projectResult = await fetchJson<ProjectResponse>(api, `/projects/${projectId}`);
  if (projectResult.unauthorized) return handleUnauthorized(api);
  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  const runsResult = await fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=12`);
  if (runsResult.unauthorized) return handleUnauthorized(api);

  const rawRuns = runsResult.ok && runsResult.data ? runsResult.data : [];
  const classified = await classifyPipelineRuns(api, projectId, rawRuns);
  if (classified.unauthorized) return handleUnauthorized(api);

  const selectedRunSummary = classified.runs.find((entry) => entry.run.id === runId) ?? null;
  if (!selectedRunSummary) {
    const preferred = pickLatestRunForPhase(classified.runs, "discovery");
    if (preferred) {
      return redirect(`/projects/${projectId}/discovery/runs/${preferred.run.id}`, {
        headers: await api.commit(),
      });
    }

    throw new Response("Pipeline run not found.", { status: 404 });
  }

  if (!isPhaseMatch(selectedRunSummary.phase, "discovery")) {
    const preferred = pickLatestRunForPhase(classified.runs, "discovery");
    if (preferred && preferred.run.id !== selectedRunSummary.run.id) {
      return redirect(`/projects/${projectId}/discovery/runs/${preferred.run.id}`, {
        headers: await api.commit(),
      });
    }
  }

  const [selectedRunResult, keywordsResult, topicsResult, rankedTopicsResult, hierarchyResult, snapshotsResult] =
    await Promise.all([
      fetchJson<PipelineRunResponse>(api, `/pipeline/${projectId}/runs/${runId}`),
      fetchJson<KeywordListResponse>(api, `/keywords/${projectId}?page=1&page_size=200`),
      fetchJson<TopicListResponse>(api, `/topics/${projectId}?page=1&page_size=200&eligibility=all`),
      fetchJson<TopicResponse[]>(api, `/topics/${projectId}/ranked?limit=30`),
      fetchJson<TopicHierarchyResponse[]>(api, `/topics/${projectId}/hierarchy`),
      fetchJson<DiscoveryTopicSnapshotResponse[]>(api, `/pipeline/${projectId}/runs/${runId}/discovery-snapshots`),
    ]);

  const batched = [selectedRunResult, keywordsResult, topicsResult, rankedTopicsResult, hierarchyResult, snapshotsResult];
  if (batched.some((result) => result.unauthorized)) return handleUnauthorized(api);

  if (!selectedRunResult.ok || !selectedRunResult.data) {
    throw new Response("Failed to load selected run.", { status: selectedRunResult.status });
  }

  const selectedRun = selectedRunResult.data;

  let progress: PipelineProgressResponse | null = null;
  if (isRunActive(selectedRun.status)) {
    const progressResult = await fetchJson<PipelineProgressResponse>(api, `/pipeline/${projectId}/runs/${runId}/progress`);
    if (progressResult.unauthorized) return handleUnauthorized(api);
    if (progressResult.ok && progressResult.data) {
      progress = progressResult.data;
    }
  }

  const effectiveSteps = (progress?.steps ?? selectedRun.step_executions ?? []) as StepExecutionResponse[];
  if (stepFocusParsed.stepFocus !== null && !effectiveSteps.some((step) => step.step_number === stepFocusParsed.stepFocus)) {
    throw new Response("Requested step was not found in this run.", { status: 404 });
  }

  return data(
    {
      project: projectResult.data,
      runs: classified.runs,
      selectedRun,
      progress,
      stepFocus: stepFocusParsed.stepFocus,
      keywords: keywordsResult.ok && keywordsResult.data ? keywordsResult.data.items ?? [] : [],
      topics: topicsResult.ok && topicsResult.data ? topicsResult.data.items ?? [] : [],
      rankedTopics: rankedTopicsResult.ok && rankedTopicsResult.data ? rankedTopicsResult.data : [],
      topicHierarchy: hierarchyResult.ok && hierarchyResult.data ? hierarchyResult.data : [],
      discoverySnapshots: snapshotsResult.ok && snapshotsResult.data ? snapshotsResult.data : [],
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
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

  if (intent !== "startDiscovery" && intent !== "pausePipeline" && intent !== "resumePipeline") {
    return data({ error: "Unsupported action." } satisfies ActionData, { status: 400 });
  }

  if (intent === "startDiscovery") {
    const payload: PipelineStartRequest = {
      mode: "discovery_loop",
      start_step: 0,
      discovery: {
        max_iterations: 3,
        min_eligible_topics: null,
        require_serp_gate: true,
        max_keyword_difficulty: 65,
        min_domain_diversity: 0.5,
        require_intent_match: true,
        auto_start_content: true,
      },
    };

    const startResponse = await api.fetch(`/pipeline/${projectId}/start`, {
      method: "POST",
      json: payload,
    });

    if (startResponse.status === 401) return handleUnauthorized(api);

    if (!startResponse.ok) {
      return data(
        { error: "Unable to start discovery run." } satisfies ActionData,
        { status: startResponse.status, headers: await api.commit() }
      );
    }

    const startedRun = (await startResponse.json()) as PipelineRunResponse;
    return redirect(`/projects/${projectId}/discovery/runs/${startedRun.id}`, {
      headers: await api.commit(),
    });
  }

  if (intent === "pausePipeline") {
    const response = await api.fetch(`/pipeline/${projectId}/pause`, {
      method: "POST",
    });

    if (response.status === 401) return handleUnauthorized(api);

    if (!response.ok) {
      return data(
        { error: "Unable to pause pipeline." } satisfies ActionData,
        { status: response.status, headers: await api.commit() }
      );
    }

    return redirect(new URL(request.url).pathname, {
      headers: await api.commit(),
    });
  }

  const runId = String(formData.get("run_id") ?? params.runId ?? "").trim();
  if (!runId) {
    return data({ error: "Missing run id." } satisfies ActionData, { status: 400 });
  }

  const resumeResponse = await api.fetch(`/pipeline/${projectId}/resume/${runId}`, {
    method: "POST",
  });

  if (resumeResponse.status === 401) return handleUnauthorized(api);

  if (!resumeResponse.ok) {
    return data(
      { error: "Unable to resume pipeline." } satisfies ActionData,
      { status: resumeResponse.status, headers: await api.commit() }
    );
  }

  return redirect(new URL(request.url).pathname, {
    headers: await api.commit(),
  });
}

export default function ProjectDiscoveryRunRoute() {
  const {
    project,
    runs,
    selectedRun,
    progress,
    stepFocus,
    keywords,
    topics,
    rankedTopics,
    topicHierarchy,
    discoverySnapshots,
  } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const progressFetcher = useFetcher<PipelineProgressResponse>();
  const isProgressRequestInFlightRef = useRef(false);
  const keywordDetailFetcher = useFetcher<KeywordDetailResponse>();

  const [keywordSearch, setKeywordSearch] = useState("");
  const [keywordStatusFilter, setKeywordStatusFilter] = useState("all");
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"loop" | "keywords" | "topics" | "runs">("loop");

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

  const stepTimeline = useMemo<StepTimelineRow[]>(() => {
    const grouped = new Map<number, StepExecutionResponse[]>();

    stepExecutions.forEach((step) => {
      const current = grouped.get(step.step_number) ?? [];
      current.push(step);
      grouped.set(step.step_number, current);
    });

    return Array.from(grouped.entries())
      .map(([stepNumber, attempts]) => {
        const orderedAttempts = attempts.slice().sort((a, b) => getStepExecutionTimestamp(a) - getStepExecutionTimestamp(b));
        const latest = orderedAttempts[orderedAttempts.length - 1]!;
        const historicalFailureCount = orderedAttempts
          .slice(0, -1)
          .filter((attempt) => isRunFailed(attempt.status)).length;

        return {
          stepNumber,
          stepName: formatStepName(latest.step_name),
          latest,
          attempts: orderedAttempts,
          historicalFailureCount,
        };
      })
      .sort((a, b) => a.stepNumber - b.stepNumber);
  }, [stepExecutions]);

  const activeStepNumber = useMemo(() => {
    if (stepTimeline.length === 0) return null;
    if (typeof stepFocus === "number" && stepTimeline.some((entry) => entry.stepNumber === stepFocus)) return stepFocus;

    const activeStep = stepTimeline.find((entry) => isRunActive(entry.latest.status));
    if (activeStep) return activeStep.stepNumber;

    const failedStep = stepTimeline
      .slice()
      .reverse()
      .find((entry) => isRunFailed(entry.latest.status));
    if (failedStep) return failedStep.stepNumber;

    return stepTimeline[stepTimeline.length - 1]?.stepNumber ?? null;
  }, [stepFocus, stepTimeline]);

  const activeStepEntry = stepTimeline.find((entry) => entry.stepNumber === activeStepNumber) ?? null;
  const previousStepEntries = stepTimeline.filter((entry) => entry.stepNumber !== activeStepNumber);

  const latestStepExecutions = stepTimeline.map((entry) => entry.latest);
  const stepSummary = summarizeSteps(latestStepExecutions);
  const overallProgress = Math.round(liveProgress?.overall_progress ?? calculateOverallProgress(stepExecutions));

  const snapshotsByIteration = useMemo(() => {
    const map = new Map<number, DiscoveryTopicSnapshotResponse[]>();
    discoverySnapshots.forEach((snapshot) => {
      const current = map.get(snapshot.iteration_index) ?? [];
      current.push(snapshot);
      map.set(snapshot.iteration_index, current);
    });

    return Array.from(map.entries())
      .map(([iteration, snapshots]) => ({
        iteration,
        snapshots: snapshots.slice().sort((a, b) => a.topic_name.localeCompare(b.topic_name)),
      }))
      .sort((a, b) => a.iteration - b.iteration);
  }, [discoverySnapshots]);

  const snapshotAcceptedCount = discoverySnapshots.filter((snapshot) => isAcceptedDecision(snapshot.decision)).length;
  const snapshotRejectedCount = discoverySnapshots.filter((snapshot) => isRejectedDecision(snapshot.decision)).length;
  const snapshotUnknownCount = Math.max(0, discoverySnapshots.length - snapshotAcceptedCount - snapshotRejectedCount);

  const acceptanceRate =
    discoverySnapshots.length === 0 ? 0 : Math.round((snapshotAcceptedCount / discoverySnapshots.length) * 100);

  function buildDiscoveryRunUrl(runId: string) {
    return `/projects/${project.id}/discovery/runs/${runId}`;
  }

  function buildDiscoveryStepUrl(runId: string, stepNumber: number) {
    return `/projects/${project.id}/discovery/runs/${runId}/steps/${stepNumber}`;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0f6f5] to-[#ecf2fb] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Discovery loop</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600">Iterative keyword and topic discovery until topic threshold is met.</p>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/projects/${project.id}/creation`}>
              <Button variant="outline">Creation phase</Button>
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

      <Card>
        <CardHeader>
          <CardTitle>Run controls</CardTitle>
          <CardDescription>Start, pause, resume, or switch discovery runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Form method="post">
              <input type="hidden" name="intent" value="startDiscovery" />
              <Button type="submit" disabled={isRunActive(effectiveStatus)}>
                Start new discovery run
              </Button>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="pausePipeline" />
              <Button type="submit" variant="outline" disabled={!isRunActive(effectiveStatus)}>
                Pause
              </Button>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="resumePipeline" />
              <input type="hidden" name="run_id" value={selectedRun.id} />
              <Button type="submit" disabled={!isRunPaused(effectiveStatus) && !isRunFailed(effectiveStatus)}>
                Resume
              </Button>
            </Form>

            {stepFocus !== null ? (
              <Link to={buildDiscoveryRunUrl(selectedRun.id)}>
                <Button variant="outline">Clear step focus</Button>
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex w-full items-center gap-2 text-sm text-slate-600 md:w-auto">
              <span>Run:</span>
              <Select
                value={selectedRun.id}
                onChange={(event) => {
                  const runValue = event.target.value;
                  if (!runValue) return;
                  navigate(buildDiscoveryRunUrl(runValue));
                }}
                className="h-9 min-w-[280px] flex-1 md:flex-none"
              >
                {runs.map((entry) => (
                  <option key={entry.run.id} value={entry.run.id}>
                    {entry.run.id.slice(0, 8)} · {toPhaseLabel(entry.phase)} · {formatStatusLabel(entry.run.status)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </CardContent>
      </Card>

      {actionData?.error ? (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {actionData.error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-slate-200 bg-slate-50/80">
          <CardContent className="space-y-3 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Run health</p>
                <p className="font-semibold text-slate-900">Run {selectedRun.id.slice(0, 8)}</p>
              </div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(effectiveStatus)}`}
              >
                {formatStatusLabel(effectiveStatus)}
              </span>
            </div>
            <Progress value={overallProgress} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <p>Current step: {formatStepName(liveProgress?.current_step_name ?? activeStepEntry?.latest.step_name ?? "Not started")}</p>
              <p>Run started: {formatDateTime(selectedRun.started_at ?? selectedRun.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-emerald-100 px-2 py-2 text-emerald-900">
                <p className="font-semibold">Succeeded</p>
                <p>{stepSummary.succeeded}</p>
              </div>
              <div className="rounded-lg bg-amber-100 px-2 py-2 text-amber-900">
                <p className="font-semibold">Active</p>
                <p>{stepSummary.active}</p>
              </div>
              <div className="rounded-lg bg-rose-100 px-2 py-2 text-rose-900">
                <p className="font-semibold">Failed</p>
                <p>{stepSummary.failed}</p>
              </div>
              <div className="rounded-lg bg-slate-200 px-2 py-2 text-slate-800">
                <p className="font-semibold">Other</p>
                <p>{stepSummary.other}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Step timeline</CardTitle>
            <CardDescription>Loop progress by execution step.</CardDescription>
          </CardHeader>
          <CardContent>
            {stepTimeline.length === 0 ? (
              <p className="text-sm text-slate-500">No step executions recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {activeStepEntry ? (
                  <Card
                    className={cn(
                      "border-[#2f6f71]/35 bg-slate-50/80 shadow-[0_20px_40px_-28px_rgba(47,111,113,0.85)]",
                      stepFocus === activeStepEntry.stepNumber && "ring-2 ring-[#2f6f71]/40"
                    )}
                  >
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#2f6f71]">Current step</p>
                          <CardTitle>{activeStepEntry.stepName}</CardTitle>
                          <CardDescription>
                            Step {activeStepEntry.stepNumber} · {formatStepItems(activeStepEntry.latest)}
                          </CardDescription>
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(activeStepEntry.latest.status)}`}
                        >
                          {formatStatusLabel(activeStepEntry.latest.status)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <Progress value={activeStepEntry.latest.progress_percent} />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <p>
                          {activeStepEntry.latest.progress_percent}% · {activeStepEntry.latest.progress_message ?? "No message"}
                        </p>
                        <p>
                          {formatDateTime(activeStepEntry.latest.started_at)}
                          {activeStepEntry.latest.completed_at ? ` -> ${formatDateTime(activeStepEntry.latest.completed_at)}` : ""}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {previousStepEntries.map((entry, index) => {
                  const step = entry.latest;
                  const isFocused = stepFocus === entry.stepNumber;
                  const isFirstItem = index === 0;
                  const isLastItem = index === previousStepEntries.length - 1;

                  return (
                    <motion.div
                      key={entry.stepNumber}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                      className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 md:grid-cols-[170px_24px_minmax(0,1fr)] md:gap-4"
                    >
                      <div className="hidden pt-1 text-right md:block">
                        <p className="text-[11px] font-semibold text-slate-700">{formatTimelineTimestamp(step.started_at)}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Started</p>
                      </div>

                      <div className="relative col-start-1 row-span-1 flex justify-center md:col-start-2">
                        {!isFirstItem ? <span className="absolute -top-4 bottom-1/2 w-px bg-slate-200" /> : null}
                        {!isLastItem ? <span className="absolute top-3 -bottom-4 w-px bg-slate-200" /> : null}
                        <span
                          className={cn(
                            "relative mt-2 inline-flex h-2.5 w-2.5 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(148,163,184,0.18)]",
                            getTimelineDotClass(step.status)
                          )}
                        />
                      </div>

                      <Link
                        to={buildDiscoveryStepUrl(selectedRun.id, entry.stepNumber)}
                        className={cn(
                          "col-start-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_12px_30px_-16px_rgba(15,23,42,0.45)] md:col-start-3",
                          isFocused && "ring-2 ring-[#2f6f71]/35"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step {entry.stepNumber}</p>
                            <p className="truncate font-semibold text-slate-900">{entry.stepName}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500 md:hidden">
                              Started {formatDateTime(step.started_at)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(step.status)}`}
                          >
                            {formatStatusLabel(step.status)}
                          </span>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Tabs>
        <TabsList>
          <TabsTrigger active={activeView === "loop"} onClick={() => setActiveView("loop")}>
            Discovery loop
          </TabsTrigger>
          <TabsTrigger active={activeView === "keywords"} onClick={() => setActiveView("keywords")}>
            Keywords
          </TabsTrigger>
          <TabsTrigger active={activeView === "topics"} onClick={() => setActiveView("topics")}>
            Topics
          </TabsTrigger>
          <TabsTrigger active={activeView === "runs"} onClick={() => setActiveView("runs")}>
            Runs
          </TabsTrigger>
        </TabsList>

        <TabsContent>
          {activeView === "loop" ? (
            <Card>
              <CardHeader>
                <CardTitle>Discovery loop overview</CardTitle>
                <CardDescription>Iteration-level decisions from discovery snapshots.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-4 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="font-semibold text-slate-900">Iterations</p>
                    <p>{snapshotsByIteration.length}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="font-semibold text-emerald-900">Accepted topics</p>
                    <p>{snapshotAcceptedCount}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                    <p className="font-semibold text-rose-900">Rejected topics</p>
                    <p>{snapshotRejectedCount}</p>
                  </div>
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                    <p className="font-semibold text-indigo-900">Acceptance rate</p>
                    <p>{acceptanceRate}%</p>
                  </div>
                </div>

                {snapshotUnknownCount > 0 ? (
                  <p className="text-xs text-slate-500">{snapshotUnknownCount} snapshots had non-standard decision labels.</p>
                ) : null}

                {snapshotsByIteration.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                    No discovery snapshots yet for this run.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {snapshotsByIteration.map((group) => {
                      const accepted = group.snapshots.filter((snapshot) => isAcceptedDecision(snapshot.decision));
                      const rejected = group.snapshots.filter((snapshot) => isRejectedDecision(snapshot.decision));
                      const other = group.snapshots.filter(
                        (snapshot) => !isAcceptedDecision(snapshot.decision) && !isRejectedDecision(snapshot.decision)
                      );

                      return (
                        <div key={group.iteration} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900">Iteration {group.iteration + 1}</p>
                            <span className="text-xs text-slate-500">{group.snapshots.length} snapshots</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-900">
                              Accepted: {accepted.length}
                            </span>
                            <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-900">
                              Rejected: {rejected.length}
                            </span>
                            {other.length > 0 ? (
                              <span className="rounded-full bg-slate-200 px-2 py-1 font-semibold text-slate-700">
                                Other: {other.length}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 space-y-2 text-xs">
                            {group.snapshots.map((snapshot) => (
                              <div key={snapshot.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-slate-900">{snapshot.topic_name}</p>
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                      isAcceptedDecision(snapshot.decision)
                                        ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                                        : isRejectedDecision(snapshot.decision)
                                          ? "border-rose-300 bg-rose-100 text-rose-900"
                                          : "border-slate-300 bg-slate-100 text-slate-700"
                                    )}
                                  >
                                    {snapshot.decision}
                                  </span>
                                </div>
                                <p className="text-slate-600">
                                  Fit: {snapshot.fit_score ?? "n/a"} · KD: {snapshot.keyword_difficulty ?? "n/a"} · Diversity:{" "}
                                  {snapshot.domain_diversity ?? "n/a"}
                                </p>
                                {snapshot.rejection_reasons && snapshot.rejection_reasons.length > 0 ? (
                                  <p className="text-rose-700">Reasons: {snapshot.rejection_reasons.join(", ")}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeView === "keywords" ? (
            <section className="space-y-4">
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
            </section>
          ) : null}

          {activeView === "topics" ? (
            <section className="space-y-4">
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
            </section>
          ) : null}

          {activeView === "runs" ? (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle>Run classification snapshot</CardTitle>
                  <CardDescription>Heuristic run splitting for phase-specific navigation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {runs.map((entry) => (
                    <Link
                      key={entry.run.id}
                      to={buildDiscoveryRunUrl(entry.run.id)}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-3 py-2 text-sm",
                        entry.run.id === selectedRun.id ? "border-[#2f6f71] bg-[#2f6f71]/10" : "border-slate-200 bg-white"
                      )}
                    >
                      <p className="font-semibold text-slate-900">
                        {entry.run.id.slice(0, 8)} · {formatDateTime(entry.run.created_at)}
                      </p>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toPhaseBadgeClass(entry.phase)}`}
                        >
                          {toPhaseLabel(entry.phase)}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeClass(entry.run.status)}`}
                        >
                          {formatStatusLabel(entry.run.status)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : null}
        </TabsContent>
      </Tabs>

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
