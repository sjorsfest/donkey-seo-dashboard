import type { Edge, Node } from "@xyflow/react";
import type { components } from "~/types/api.generated";

type KeywordResponse = components["schemas"]["KeywordResponse"];
type TopicResponse = components["schemas"]["TopicResponse"];

export function buildKeywordGraph(keywords: KeywordResponse[], topics: TopicResponse[]) {
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
        label: topic.name,
        keywordCount: topic.keyword_count,
        isTopic: true,
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

      nodes.push({
        id: `keyword-${keyword.id}`,
        position: { x, y },
        data: {
          label: keyword.keyword,
          keywordId: keyword.id,
          isSeed,
          volume: keyword.search_volume,
          difficulty: keyword.difficulty,
          intent: keyword.intent,
          priority: keyword.priority_score,
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
