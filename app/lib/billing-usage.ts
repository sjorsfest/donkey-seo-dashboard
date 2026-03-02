import type { components } from "~/types/api.generated";

export type BillingUsageResponse = components["schemas"]["BillingUsageResponse"];

export function isArticleLimitReached(usage: BillingUsageResponse | null | undefined) {
  if (!usage) return false;
  if (typeof usage.remaining_articles === "number") return usage.remaining_articles <= 0;
  return usage.used_articles >= usage.article_limit;
}

export function isFreeTierUsage(usage: BillingUsageResponse | null | undefined) {
  if (!usage) return false;
  return usage.plan === null || usage.window_kind === "lifetime";
}

export function formatArticleLimitReachedMessage(usage: BillingUsageResponse | null | undefined) {
  if (!usage) return "Article limit reached for this account. Upgrade your plan to resume discovery.";
  return `Article limit reached (${usage.used_articles}/${usage.article_limit}). Upgrade your plan to resume discovery.`;
}
