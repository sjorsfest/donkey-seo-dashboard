import type { components } from "~/types/api.generated";

export type SetupPreset = "traffic_growth" | "lead_generation" | "revenue_content";

export type DashboardRunState =
  | "queued"
  | "running"
  | "in_progress"
  | "paused"
  | "completed"
  | "failed"
  | "error"
  | "unknown";

export type DashboardTab = "status" | "keywords" | "topics" | "briefs";

export type StepArtifactContext = {
  stepId: string;
  stepNumber: number;
  stepName: string;
  status: string;
  progressMessage: string | null;
  itemsProcessed: number;
  itemsTotal: number | null;
  errorMessage: string | null;
  relatedTabs: DashboardTab[];
};

export type KeywordGraphNodeType = "topic" | "seed" | "related";

export type KeywordGraphNode = {
  id: string;
  type: KeywordGraphNodeType;
  label: string;
  keywordId: string | null;
  topicId: string | null;
  x: number;
  y: number;
  meta?: {
    volume: number | null;
    difficulty: number | null;
    intent: string | null;
    priorityScore: number | null;
  };
};

export type KeywordGraphEdgeType = "keyword_topic" | "seed_related";

export type KeywordGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: KeywordGraphEdgeType;
};

export type DashboardKeyword = components["schemas"]["KeywordResponse"];
export type DashboardTopic = components["schemas"]["TopicResponse"];
