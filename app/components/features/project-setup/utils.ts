import type {
  AuthorCreate,
  AuthorDraft,
  BrandVisualContextResponse,
  SetupStep,
  SubmittedOnboardingAuthor,
} from "./types";

export const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "error", "paused", "cancelled"]);
export const FAILURE_LIKE_TASK_STATUSES = new Set(["failed", "error", "paused", "cancelled"]);
export const MIN_POSTS_PER_WEEK = 1;
export const MAX_POSTS_PER_WEEK = 7;
export const DEFAULT_POSTS_PER_WEEK = 3;
export const POSTS_PER_WEEK_OPTIONS = Array.from({ length: MAX_POSTS_PER_WEEK }, (_, index) => index + 1);

export function parseStep(value: string | null): SetupStep {
  if (value === "2") return 2;
  if (value === "3") return 3;
  if (value === "4") return 4;
  if (value === "5") return 5;
  return 1;
}

export function clampPostsPerWeek(value: number) {
  return Math.max(MIN_POSTS_PER_WEEK, Math.min(MAX_POSTS_PER_WEEK, Math.round(value)));
}

export function parsePostsPerWeek(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < MIN_POSTS_PER_WEEK || parsed > MAX_POSTS_PER_WEEK) return null;
  return parsed;
}

export function createEmptyAuthorDraft(id: string): AuthorDraft {
  return {
    id,
    persisted_author_id: "",
    name: "",
    bio: "",
    website_url: "",
    linkedin_url: "",
    twitter_url: "",
    profile_image_source_url: "",
    profile_image_object_key: "",
    profile_image_mime_type: "",
  };
}

export function hasAuthorDraftContent(author: AuthorDraft): boolean {
  return [
    author.persisted_author_id,
    author.name,
    author.bio,
    author.website_url,
    author.linkedin_url,
    author.twitter_url,
    author.profile_image_source_url,
    author.profile_image_object_key,
    author.profile_image_mime_type,
  ].some((value) => value.trim().length > 0);
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalUrl(value: unknown): string | null {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeTwitterProfileUrl(value: unknown): string | null {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;

  const stripped = raw.replace(/^@+/, "");
  const withProtocol = /^https?:\/\//i.test(stripped)
    ? stripped
    : /^(?:www\.|mobile\.)?(?:x|twitter)\.com\//i.test(stripped)
      ? `https://${stripped}`
      : null;

  if (!withProtocol) {
    return /^[A-Za-z0-9_]{1,15}$/.test(stripped) ? `https://x.com/${stripped}` : null;
  }

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    const hostname = parsed.hostname.toLowerCase();
    const isKnownXHost =
      hostname === "x.com" ||
      hostname === "www.x.com" ||
      hostname === "twitter.com" ||
      hostname === "www.twitter.com" ||
      hostname === "mobile.twitter.com";

    if (isKnownXHost) {
      const firstPathSegment = parsed.pathname
        .split("/")
        .filter(Boolean)
        .map((segment) => segment.replace(/^@+/, ""))[0];

      if (!firstPathSegment || !/^[A-Za-z0-9_]{1,15}$/.test(firstPathSegment)) return null;
      return `https://x.com/${firstPathSegment}`;
    }

    // Backward compatibility: old bug stored bare handles as hosts (e.g. https://jack).
    const hostAsHandle = parsed.hostname.replace(/^@+/, "");
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments.length === 0 && /^[A-Za-z0-9_]{1,15}$/.test(hostAsHandle)) {
      return `https://x.com/${hostAsHandle}`;
    }

    return null;
  } catch {
    return null;
  }
}

export function parseOnboardingAuthorRecord(
  value: unknown,
  index: number
): { author: SubmittedOnboardingAuthor | null; error: string | null } {
  if (!value || typeof value !== "object") return { author: null, error: null };

  const record = value as Record<string, unknown>;
  const persistedAuthorId = normalizeOptionalString(record.persisted_author_id);
  const bio = normalizeOptionalString(record.bio);
  const rawWebsiteUrl = normalizeOptionalString(record.website_url) ?? normalizeOptionalString(record.blog_url);
  const rawLinkedinUrl = normalizeOptionalString(record.linkedin_url);
  const rawTwitterUrl = normalizeOptionalString(record.twitter_url) ?? normalizeOptionalString(record.x_url);
  const rawProfileImageSourceUrl = normalizeOptionalString(record.profile_image_source_url);
  const profileImageObjectKey = normalizeOptionalString(record.profile_image_object_key);
  const profileImageMimeType = normalizeOptionalString(record.profile_image_mime_type);
  const name = normalizeOptionalString(record.name);

  if (!name) {
    if (
      persistedAuthorId ||
      bio ||
      rawWebsiteUrl ||
      rawLinkedinUrl ||
      rawTwitterUrl ||
      rawProfileImageSourceUrl ||
      profileImageObjectKey ||
      profileImageMimeType
    ) {
      return { author: null, error: `Author ${index + 1}: name is required when other details are provided.` };
    }
    return { author: null, error: null };
  }

  const websiteUrl = rawWebsiteUrl ? normalizeOptionalUrl(rawWebsiteUrl) : null;
  const linkedinUrl = rawLinkedinUrl ? normalizeOptionalUrl(rawLinkedinUrl) : null;
  const twitterUrl = rawTwitterUrl ? normalizeTwitterProfileUrl(rawTwitterUrl) : null;
  const profileImageSourceUrl = rawProfileImageSourceUrl ? normalizeOptionalUrl(rawProfileImageSourceUrl) : null;

  if (rawWebsiteUrl && !websiteUrl) {
    return { author: null, error: `Author ${index + 1}: blog URL must be a valid URL.` };
  }
  if (rawLinkedinUrl && !linkedinUrl) {
    return { author: null, error: `Author ${index + 1}: LinkedIn URL must be a valid URL.` };
  }
  if (rawTwitterUrl && !twitterUrl) {
    return { author: null, error: `Author ${index + 1}: X/Twitter URL must be a valid URL.` };
  }
  if (rawProfileImageSourceUrl && !profileImageSourceUrl) {
    return { author: null, error: `Author ${index + 1}: profile image URL must be a valid URL.` };
  }

  return {
    author: {
      persisted_author_id: persistedAuthorId,
      name,
      bio,
      website_url: websiteUrl,
      linkedin_url: linkedinUrl,
      twitter_url: twitterUrl,
      profile_image_source_url: profileImageSourceUrl,
      profile_image_object_key: profileImageObjectKey,
      profile_image_mime_type: profileImageMimeType,
    },
    error: null,
  };
}

export function parseOnboardingAuthors(rawAuthors: string): { authors: SubmittedOnboardingAuthor[]; error: string | null } {
  let parsed: unknown = [];

  try {
    parsed = JSON.parse(rawAuthors);
  } catch {
    return { authors: [], error: "Invalid authors payload." };
  }

  if (!Array.isArray(parsed)) {
    return { authors: [], error: "Invalid authors payload." };
  }

  const authors: SubmittedOnboardingAuthor[] = [];
  const seenNames = new Set<string>();

  for (const [index, value] of parsed.entries()) {
    const { author, error } = parseOnboardingAuthorRecord(value, index);
    if (error) return { authors: [], error };
    if (!author) continue;

    const dedupeKey = author.name.toLowerCase();
    if (seenNames.has(dedupeKey)) continue;
    seenNames.add(dedupeKey);

    authors.push(author);
  }

  return { authors: authors.slice(0, 8), error: null };
}

export function buildAuthorMutationPayload(author: SubmittedOnboardingAuthor): AuthorCreate {
  const payload: AuthorCreate = {
    name: author.name,
  };

  if (author.bio) payload.bio = author.bio;
  const socialUrls: Record<string, string> = {};
  if (author.website_url) socialUrls.website = author.website_url;
  if (author.linkedin_url) socialUrls.linkedin = author.linkedin_url;
  if (author.twitter_url) socialUrls.twitter = author.twitter_url;
  if (Object.keys(socialUrls).length > 0) payload.social_urls = socialUrls;
  if (author.profile_image_source_url) payload.profile_image_source_url = author.profile_image_source_url;

  return payload;
}

function stringifyUnknownValue(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value.map((entry) => stringifyUnknownValue(entry)).filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const summaryKeys = ["name", "title", "description", "summary", "segment", "persona"];
  for (const key of summaryKeys) {
    const match = Object.entries(record).find(([candidate]) => candidate.toLowerCase() === key)?.[1];
    const normalized = stringifyUnknownValue(match);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeContextKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tryParseJsonLikeString(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function collectMatchingContextEntries(
  value: unknown,
  normalizedTargetKeys: Set<string>,
  visited: WeakSet<object>,
  matches: unknown[]
) {
  const parsedValue = tryParseJsonLikeString(value);

  if (Array.isArray(parsedValue)) {
    for (const item of parsedValue) {
      collectMatchingContextEntries(item, normalizedTargetKeys, visited, matches);
    }
    return;
  }

  if (!parsedValue || typeof parsedValue !== "object") return;
  if (visited.has(parsedValue)) return;
  visited.add(parsedValue);

  const record = parsedValue as Record<string, unknown>;
  for (const [candidateKey, candidateValue] of Object.entries(record)) {
    if (normalizedTargetKeys.has(normalizeContextKey(candidateKey))) {
      matches.push(candidateValue);
    }

    collectMatchingContextEntries(candidateValue, normalizedTargetKeys, visited, matches);
  }
}

function getBrandContextEntries(brand: BrandVisualContextResponse | null, keys: string[]) {
  if (!brand) return [];

  const normalizedTargetKeys = new Set(keys.map((key) => normalizeContextKey(key)));
  const sources = [brand as unknown, brand.visual_style_guide, brand.visual_prompt_contract] as Array<unknown>;
  const visited = new WeakSet<object>();
  const matches: unknown[] = [];

  for (const source of sources) {
    collectMatchingContextEntries(source, normalizedTargetKeys, visited, matches);
  }

  return matches;
}

export function getBrandContextValue(brand: BrandVisualContextResponse | null, keys: string[]) {
  const entries = getBrandContextEntries(brand, keys);
  for (const entry of entries) {
    const normalized = stringifyUnknownValue(entry);
    if (normalized) return normalized;
  }
  return null;
}

function getStringListFromUnknown(value: unknown): string[] {
  const parsed = tryParseJsonLikeString(value);
  if (!parsed) return [];

  if (Array.isArray(parsed)) {
    return parsed
      .map((entry) => stringifyUnknownValue(entry))
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof parsed === "object") {
    return Object.values(parsed as Record<string, unknown>)
      .map((entry) => stringifyUnknownValue(entry))
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  const singleValue = stringifyUnknownValue(parsed);
  return singleValue ? [singleValue] : [];
}

export function extractIcpNicheNames(brand: BrandVisualContextResponse | null) {
  const entries = getBrandContextEntries(brand, ["suggested_icp_niches", "icp_niches", "recommended_icp_niches"]);
  if (entries.length === 0) return [];

  const values = entries.flatMap((entry) => {
    const parsed = tryParseJsonLikeString(entry);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return null;

        const record = item as Record<string, unknown>;
        return (
          stringifyUnknownValue(record.niche_name) ??
          stringifyUnknownValue(record.name) ??
          stringifyUnknownValue(record.title) ??
          stringifyUnknownValue(record.segment)
        );
      })
      .filter((item): item is string => Boolean(item))
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  });

  return Array.from(new Set(values));
}

export function extractDifferentiators(brand: BrandVisualContextResponse | null) {
  const keys = [
    "suggested_differentiators",
    "differentiators",
    "key_differentiators",
    "product_differentiators",
    "competitive_differentiators",
    "unique_value_propositions",
    "unique_value_props",
    "usp",
  ];

  for (const key of keys) {
    const entries = getBrandContextEntries(brand, [key]);
    for (const entry of entries) {
      if (!entry) continue;

      const values = getStringListFromUnknown(entry);
      if (values.length > 0) {
        return Array.from(new Set(values));
      }
    }
  }

  return [];
}

export function buildOnboardingUrl({
  step,
  projectId,
  setupRunId,
  setupTaskId,
  prefill,
}: {
  step: SetupStep;
  projectId?: string | null;
  setupRunId?: string | null;
  setupTaskId?: string | null;
  prefill?: { domain?: string; name?: string; description?: string; posts_per_week?: number };
}) {
  const search = new URLSearchParams();
  search.set("step", String(step));

  if (projectId) search.set("projectId", projectId);
  if (setupRunId) search.set("setupRunId", setupRunId);
  if (setupTaskId) search.set("setupTaskId", setupTaskId);

  if (prefill?.domain) search.set("domain", prefill.domain);
  if (prefill?.name) search.set("name", prefill.name);
  if (prefill?.description) search.set("description", prefill.description);
  if (typeof prefill?.posts_per_week === "number") {
    search.set("posts_per_week", String(clampPostsPerWeek(prefill.posts_per_week)));
  }

  return `/projects/new?${search.toString()}`;
}
