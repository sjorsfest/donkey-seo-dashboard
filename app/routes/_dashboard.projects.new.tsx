import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Linkedin, Twitter, Upload } from "lucide-react";
import { Form, Link, data, redirect, useActionData, useFetcher, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/_dashboard.projects.new";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Select } from "~/components/ui/select";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import {
  buildPresetConstraints,
  buildPresetGoals,
  formatStatusLabel,
  getStatusBadgeClass,
  isValidDomain,
  sanitizeDomainInput,
  suggestProjectNameFromDomain,
} from "~/lib/dashboard";
import { COUNTRY_OPTIONS, countryToLocale } from "~/lib/onboarding";
import { pickLatestRunForModule } from "~/lib/pipeline-module";
import { fetchJson } from "~/lib/pipeline-run.server";
import { useOnboarding } from "~/components/onboarding/onboarding-context";
import { OnboardingOverlay } from "~/components/onboarding/onboarding-overlay";
import { DonkeyBubble } from "~/components/onboarding/donkey-bubble";
import type { components } from "~/types/api.generated";
import type { SetupPreset } from "~/types/dashboard";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type ProjectUpdate = components["schemas"]["ProjectUpdate"];
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type ProjectOnboardingBootstrapRequest = components["schemas"]["ProjectOnboardingBootstrapRequest"];
type ProjectOnboardingBootstrapResponse = components["schemas"]["ProjectOnboardingBootstrapResponse"];
type TaskStatusResponse = components["schemas"]["TaskStatusResponse"];
type BrandVisualContextResponse = components["schemas"]["BrandVisualContextResponse"];

type LoaderData = {
  step: 1 | 2 | 3 | 4;
  projectId: string | null;
  setupRunId: string | null;
  setupTaskId: string | null;
  project: ProjectResponse | null;
  prefill: {
    domain: string;
    name: string;
    description: string;
  };
};

type ActionData = {
  error?: string;
  fieldErrors?: {
    domain?: string;
    name?: string;
    authors?: string;
  };
};

type AuthorDraft = {
  id: string;
  name: string;
  bio: string;
  website_url: string;
  linkedin_url: string;
  twitter_url: string;
  profile_image_source_url: string;
};

type SubmittedOnboardingAuthor = {
  name: string;
  bio: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  profile_image_source_url: string | null;
};

type TaskStatusLoaderData = {
  task: TaskStatusResponse | null;
  error?: string;
};

type BrandVisualContextLoaderData = {
  brand: BrandVisualContextResponse | null;
  error?: string;
};

const PRESET_OPTIONS: Array<{ value: SetupPreset; title: string; description: string }> = [
  {
    value: "traffic_growth",
    title: "Traffic Growth",
    description:
      "Maximize organic visibility with high-volume keywords. Build topical authority and become the go-to resource in your niche.",
  },
  {
    value: "lead_generation",
    title: "Lead Generation",
    description:
      "Target comparison and buyer-intent queries that drive demo requests and sign-ups. Convert searchers into qualified leads.",
  },
  {
    value: "revenue_content",
    title: "Revenue Content",
    description:
      "Focus on money-page keywords: alternatives, pricing, use cases. Drive revenue through high-intent commercial content.",
  },
];

const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "error", "paused", "cancelled"]);
const FAILURE_LIKE_TASK_STATUSES = new Set(["failed", "error", "paused", "cancelled"]);

function parseStep(value: string | null): 1 | 2 | 3 | 4 {
  if (value === "2") return 2;
  if (value === "3") return 3;
  if (value === "4") return 4;
  return 1;
}

function parseSetupPreset(value: string): SetupPreset {
  if (value === "lead_generation" || value === "lead_gen") return "lead_generation";
  if (value === "revenue_content") return value;
  return "traffic_growth";
}

function createEmptyAuthorDraft(id: string): AuthorDraft {
  return {
    id,
    name: "",
    bio: "",
    website_url: "",
    linkedin_url: "",
    twitter_url: "",
    profile_image_source_url: "",
  };
}

function hasAuthorDraftContent(author: AuthorDraft): boolean {
  return [
    author.name,
    author.bio,
    author.website_url,
    author.linkedin_url,
    author.twitter_url,
    author.profile_image_source_url,
  ].some((value) => value.trim().length > 0);
}

function normalizeOptionalString(value: unknown): string | null {
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

function parseOnboardingAuthors(rawAuthors: string): { authors: SubmittedOnboardingAuthor[]; error: string | null } {
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
    if (!value || typeof value !== "object") continue;

    const record = value as Record<string, unknown>;
    const bio = normalizeOptionalString(record.bio);
    const rawWebsiteUrl = normalizeOptionalString(record.website_url) ?? normalizeOptionalString(record.blog_url);
    const rawLinkedinUrl = normalizeOptionalString(record.linkedin_url);
    const rawTwitterUrl = normalizeOptionalString(record.twitter_url) ?? normalizeOptionalString(record.x_url);
    const rawProfileImageSourceUrl = normalizeOptionalString(record.profile_image_source_url);
    const name = normalizeOptionalString(record.name);
    if (!name) {
      if (bio || rawWebsiteUrl || rawLinkedinUrl || rawTwitterUrl || rawProfileImageSourceUrl) {
        return { authors: [], error: `Author ${index + 1}: name is required when other details are provided.` };
      }
      continue;
    }

    const dedupeKey = name.toLowerCase();
    if (seenNames.has(dedupeKey)) continue;
    seenNames.add(dedupeKey);

    const websiteUrl = rawWebsiteUrl ? normalizeOptionalUrl(rawWebsiteUrl) : null;
    const linkedinUrl = rawLinkedinUrl ? normalizeOptionalUrl(rawLinkedinUrl) : null;
    const twitterUrl = rawTwitterUrl ? normalizeOptionalUrl(rawTwitterUrl) : null;
    const profileImageSourceUrl = rawProfileImageSourceUrl ? normalizeOptionalUrl(rawProfileImageSourceUrl) : null;

    if (rawWebsiteUrl && !websiteUrl) {
      return { authors: [], error: `Author ${index + 1}: blog URL must be a valid URL.` };
    }
    if (rawLinkedinUrl && !linkedinUrl) {
      return { authors: [], error: `Author ${index + 1}: LinkedIn URL must be a valid URL.` };
    }
    if (rawTwitterUrl && !twitterUrl) {
      return { authors: [], error: `Author ${index + 1}: X/Twitter URL must be a valid URL.` };
    }
    if (rawProfileImageSourceUrl && !profileImageSourceUrl) {
      return { authors: [], error: `Author ${index + 1}: profile image URL must be a valid URL.` };
    }

    authors.push({
      name,
      bio,
      website_url: websiteUrl,
      linkedin_url: linkedinUrl,
      twitter_url: twitterUrl,
      profile_image_source_url: profileImageSourceUrl,
    });
  }

  return { authors: authors.slice(0, 8), error: null };
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

function getBrandContextEntry(brand: BrandVisualContextResponse | null, keys: string[]) {
  const entries = getBrandContextEntries(brand, keys);
  return entries[0] ?? null;
}

function getBrandContextValue(brand: BrandVisualContextResponse | null, keys: string[]) {
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

function extractIcpNicheNames(brand: BrandVisualContextResponse | null) {
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

function extractDifferentiators(brand: BrandVisualContextResponse | null) {
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

function ShimmerPlaceholder({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-slate-200/90 ${className}`}>
      <motion.div
        className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/90 to-transparent"
        animate={{ x: ["-140%", "360%"] }}
        transition={{ duration: 1.35, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

function buildOnboardingUrl({
  step,
  projectId,
  setupRunId,
  setupTaskId,
  prefill,
}: {
  step: 1 | 2 | 3 | 4;
  projectId?: string | null;
  setupRunId?: string | null;
  setupTaskId?: string | null;
  prefill?: { domain?: string; name?: string; description?: string };
}) {
  const search = new URLSearchParams();
  search.set("step", String(step));

  if (projectId) search.set("projectId", projectId);
  if (setupRunId) search.set("setupRunId", setupRunId);
  if (setupTaskId) search.set("setupTaskId", setupTaskId);

  if (prefill?.domain) search.set("domain", prefill.domain);
  if (prefill?.name) search.set("name", prefill.name);
  if (prefill?.description) search.set("description", prefill.description);

  return `/projects/new?${search.toString()}`;
}

async function handleUnauthorized(api: ApiClient) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const api = new ApiClient(request);

  const step = parseStep(url.searchParams.get("step"));
  const projectId = String(url.searchParams.get("projectId") ?? "").trim() || null;
  const setupRunId = String(url.searchParams.get("setupRunId") ?? "").trim() || null;
  const setupTaskId = String(url.searchParams.get("setupTaskId") ?? "").trim() || null;

  const prefill = {
    domain: sanitizeDomainInput(String(url.searchParams.get("domain") ?? "")),
    name: String(url.searchParams.get("name") ?? "").trim(),
    description: String(url.searchParams.get("description") ?? "").trim(),
  };

  if (step > 1 && (!projectId || !setupRunId || !setupTaskId)) {
    return data(
      {
        step: 1,
        projectId: null,
        setupRunId: null,
        setupTaskId: null,
        project: null,
        prefill,
      } satisfies LoaderData,
      { headers: await api.commit() }
    );
  }

  let project: ProjectResponse | null = null;
  if (projectId) {
    const projectResponse = await api.fetch(`/projects/${projectId}`);
    if (projectResponse.status === 401) return handleUnauthorized(api);
    if (projectResponse.ok) {
      project = (await projectResponse.json()) as ProjectResponse;
    }
  }

  return data(
    {
      step,
      projectId,
      setupRunId,
      setupTaskId,
      project,
      prefill,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export async function action({ request }: Route.ActionArgs) {
  const api = new ApiClient(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "bootstrapProject") {
    const rawDomain = String(formData.get("domain") ?? "");
    const domain = sanitizeDomainInput(rawDomain);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    const domainMissing = !domain;
    const domainInvalid = !domainMissing && !isValidDomain(domain);

    if (domainMissing || domainInvalid || !name) {
      return data(
        {
          error: domainInvalid ? "Please enter a valid domain." : "Project name and domain are required.",
          fieldErrors: {
            domain: domainMissing ? "Domain is required." : domainInvalid ? "Enter a valid domain (e.g. example.com)." : undefined,
            name: !name ? "Project name is required." : undefined,
          },
        } satisfies ActionData,
        { status: 400, headers: await api.commit() }
      );
    }

    const payload: ProjectOnboardingBootstrapRequest = {
      name,
      domain,
      description: description || null,
      primary_language: "en",
      primary_locale: "en-US",
    };

    const bootstrapResponse = await api.fetch("/projects/onboarding/bootstrap", {
      method: "POST",
      json: payload,
    });

    if (bootstrapResponse.status === 401) return handleUnauthorized(api);

    if (!bootstrapResponse.ok) {
      const apiMessage = await readApiErrorMessage(bootstrapResponse);
      return data(
        { error: apiMessage ?? "Unable to bootstrap project." } satisfies ActionData,
        { status: bootstrapResponse.status, headers: await api.commit() }
      );
    }

    const bootstrap = (await bootstrapResponse.json()) as ProjectOnboardingBootstrapResponse;
    return redirect(
      buildOnboardingUrl({
        step: 2,
        projectId: bootstrap.project.id,
        setupRunId: bootstrap.setup_run_id,
        setupTaskId: bootstrap.setup_task.task_id,
      }),
      { headers: await api.commit() }
    );
  }

  if (intent === "updateProjectStrategy") {
    const projectId = String(formData.get("project_id") ?? "").trim();
    const setupRunId = String(formData.get("setup_run_id") ?? "").trim();
    const setupTaskId = String(formData.get("setup_task_id") ?? "").trim();
    const primaryLocale = String(formData.get("primary_locale") ?? "en-US").trim() || "en-US";
    const primaryLanguage = String(formData.get("primary_language") ?? "en").trim() || "en";
    const preset = parseSetupPreset(String(formData.get("preset") ?? "traffic_growth"));

    if (!projectId || !setupRunId || !setupTaskId) {
      return data({ error: "Missing onboarding context." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    const updatePayload: ProjectUpdate = {
      primary_language: primaryLanguage,
      primary_locale: primaryLocale,
      goals: buildPresetGoals(preset),
      constraints: buildPresetConstraints(preset),
    };

    const updateResponse = await api.fetch(`/projects/${projectId}`, {
      method: "PUT",
      json: updatePayload,
    });

    if (updateResponse.status === 401) return handleUnauthorized(api);

    if (!updateResponse.ok) {
      const apiMessage = await readApiErrorMessage(updateResponse);
      return data(
        { error: apiMessage ?? "Unable to update project strategy." } satisfies ActionData,
        { status: updateResponse.status, headers: await api.commit() }
      );
    }

    return redirect(
      buildOnboardingUrl({
        step: 3,
        projectId,
        setupRunId,
        setupTaskId,
      }),
      { headers: await api.commit() }
    );
  }

  if (intent === "saveProjectAuthors") {
    const projectId = String(formData.get("project_id") ?? "").trim();
    const setupRunId = String(formData.get("setup_run_id") ?? "").trim();
    const setupTaskId = String(formData.get("setup_task_id") ?? "").trim();
    const rawAuthors = String(formData.get("authors_json") ?? "[]");

    if (!projectId || !setupRunId || !setupTaskId) {
      return data({ error: "Missing onboarding context." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    const parsedAuthors = parseOnboardingAuthors(rawAuthors);
    if (parsedAuthors.error) {
      return data(
        {
          error: parsedAuthors.error,
          fieldErrors: { authors: parsedAuthors.error },
        } satisfies ActionData,
        { status: 400, headers: await api.commit() }
      );
    }

    for (const author of parsedAuthors.authors) {
      const payload: Record<string, unknown> = {
        name: author.name,
      };

      if (author.bio) payload.bio = author.bio;
      const socialUrls: Record<string, string> = {};
      if (author.website_url) socialUrls.website = author.website_url;
      if (author.linkedin_url) socialUrls.linkedin = author.linkedin_url;
      if (author.twitter_url) socialUrls.twitter = author.twitter_url;
      if (Object.keys(socialUrls).length > 0) payload.social_urls = socialUrls;
      if (author.profile_image_source_url) payload.profile_image_source_url = author.profile_image_source_url;

      const createAuthorResponse = await api.fetch(`/authors/${projectId}`, {
        method: "POST",
        json: payload,
      });

      if (createAuthorResponse.status === 401) return handleUnauthorized(api);

      if (!createAuthorResponse.ok) {
        const apiMessage = await readApiErrorMessage(createAuthorResponse);
        return data(
          { error: apiMessage ?? "Unable to save project authors." } satisfies ActionData,
          { status: createAuthorResponse.status, headers: await api.commit() }
        );
      }
    }

    return redirect(
      buildOnboardingUrl({
        step: 4,
        projectId,
        setupRunId,
        setupTaskId,
      }),
      { headers: await api.commit() }
    );
  }

  if (intent === "startDiscovery") {
    const projectId = String(formData.get("project_id") ?? "").trim();
    const setupRunId = String(formData.get("setup_run_id") ?? "").trim();
    const setupTaskId = String(formData.get("setup_task_id") ?? "").trim();

    if (!projectId || !setupRunId || !setupTaskId) {
      return data({ error: "Missing onboarding context." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    const runsResult = await fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=12`);
    if (runsResult.unauthorized) return handleUnauthorized(api);
    if (!runsResult.ok || !runsResult.data) {
      return data(
        { error: "Unable to verify existing discovery run." } satisfies ActionData,
        { status: runsResult.status, headers: await api.commit() }
      );
    }

    const existingDiscoveryRun = pickLatestRunForModule(runsResult.data, "discovery");
    if (existingDiscoveryRun) {
      return redirect(`/projects/${projectId}/discovery/runs/${encodeURIComponent(existingDiscoveryRun.id)}?created=1`, {
        headers: await api.commit(),
      });
    }

    const payload: PipelineStartRequest = {
      mode: "discovery",
    };

    const startResponse = await api.fetch(`/pipeline/${projectId}/start`, {
      method: "POST",
      json: payload,
    });

    if (startResponse.status === 401) return handleUnauthorized(api);

    if (!startResponse.ok) {
      const apiMessage = await readApiErrorMessage(startResponse);
      return data(
        {
          error:
            apiMessage ??
            (startResponse.status === 409 ? "Discovery is already running for this project." : "Unable to start discovery."),
        } satisfies ActionData,
        { status: startResponse.status, headers: await api.commit() }
      );
    }

    const run = (await startResponse.json()) as PipelineRunResponse;
    return redirect(`/projects/${projectId}/discovery/runs/${encodeURIComponent(run.id)}?created=1`, {
      headers: await api.commit(),
    });
  }

  return data({ error: "Unsupported action." } satisfies ActionData, {
    status: 400,
    headers: await api.commit(),
  });
}

export default function ProjectSetupRoute() {
  const { step, project, projectId, setupRunId, setupTaskId, prefill } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const taskFetcher = useFetcher<TaskStatusLoaderData>();
  const brandFetcher = useFetcher<BrandVisualContextLoaderData>();

  const [domain, setDomain] = useState(prefill.domain);
  const [name, setName] = useState(prefill.name);
  const [description, setDescription] = useState(prefill.description);
  const [nameDirty, setNameDirty] = useState(Boolean(prefill.name));
  const [expandedAsset, setExpandedAsset] = useState<{ url: string; role: string } | null>(null);
  const [assetImageErrors, setAssetImageErrors] = useState<Record<string, boolean>>({});

  const [country, setCountry] = useState("worldwide");
  const [preset, setPreset] = useState<SetupPreset>("traffic_growth");
  const [authors, setAuthors] = useState<AuthorDraft[]>([createEmptyAuthorDraft("author-1")]);
  const authorImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [authorImageFileNames, setAuthorImageFileNames] = useState<Record<string, string>>({});

  const onboarding = useOnboarding();
  const [welcomeStep, setWelcomeStep] = useState<"intro" | "focus" | "done">("intro");
  const [strategyDismissed, setStrategyDismissed] = useState(false);
  const [authorsDismissed, setAuthorsDismissed] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);

  const derivedLocale = useMemo(() => countryToLocale(country), [country]);

  const isSubmitting = navigation.state === "submitting";
  const domainIsValid = isValidDomain(domain);
  const inlineDomainError = domain.length > 0 && !domainIsValid ? "Enter a valid domain (e.g. example.com)." : null;
  const domainError = domainIsValid ? null : actionData?.fieldErrors?.domain ?? inlineDomainError;
  const authorsPayloadJson = useMemo(() => {
    const normalizedAuthors = authors
      .filter((author) => hasAuthorDraftContent(author))
      .map((author) => ({
        name: author.name.trim(),
        bio: author.bio.trim(),
        website_url: author.website_url.trim(),
        linkedin_url: author.linkedin_url.trim(),
        twitter_url: author.twitter_url.trim(),
        profile_image_source_url: author.profile_image_source_url.trim(),
      }));

    return JSON.stringify(normalizedAuthors);
  }, [authors]);

  const task = taskFetcher.data?.task ?? null;
  const taskStatus = String(task?.status ?? "").toLowerCase();
  const taskCurrentStep = typeof task?.current_step === "number" ? task.current_step : null;
  const taskCompletedSteps = typeof task?.completed_steps === "number" ? task.completed_steps : 0;
  const taskTotalSteps = typeof task?.total_steps === "number" && task.total_steps > 0 ? task.total_steps : null;
  const taskDisplayStep =
    taskCurrentStep ??
    (taskCompletedSteps > 0
      ? taskCompletedSteps
      : taskTotalSteps
        ? 1
        : null);
  const taskProgress = typeof task?.progress_percent === "number"
    ? task.progress_percent
    : taskTotalSteps
      ? (taskCompletedSteps / taskTotalSteps) * 100
      : 0;
  const taskCurrentStepName = task?.current_step_name ?? null;
  const taskError = taskFetcher.data?.error ?? null;

  const isTaskCompleted = taskStatus === "completed";
  const isTaskFailureLike = FAILURE_LIKE_TASK_STATUSES.has(taskStatus);
  const taskStatusRef = useRef(taskStatus);
  const taskFetcherStateRef = useRef(taskFetcher.state);
  const brandFetcherStateRef = useRef(brandFetcher.state);
  const brandPollAttemptsRef = useRef(0);

  const brand = brandFetcher.data?.brand ?? null;
  const companyName = brand?.company_name?.trim() || null;
  const icp = getBrandContextValue(brand, [
    "icp",
    "ideal_customer_profile",
    "target_audience",
    "audience",
    "buyer_persona",
    "persona",
  ]);
  const productType = getBrandContextValue(brand, [
    "product_type",
    "offering_type",
    "product_category",
    "category",
    "business_model",
    "offering",
  ]);
  const icpNicheNames = extractIcpNicheNames(brand);
  const differentiators = extractDifferentiators(brand);
  const icpSummary = icpNicheNames.length > 0 ? icpNicheNames.slice(0, 2).join(" · ") : icp;
  const hasBrandContextInsights = Boolean(icpSummary || productType || icpNicheNames.length > 0 || differentiators.length > 0);

  const retryLink = useMemo(() => {
    return buildOnboardingUrl({
      step: 1,
      prefill: {
        domain: project?.domain ?? domain,
        name: project?.name ?? name,
        description: project?.description ?? description,
      },
    });
  }, [description, domain, name, project?.description, project?.domain, project?.name]);

  useEffect(() => {
    taskStatusRef.current = taskStatus;
  }, [taskStatus]);

  useEffect(() => {
    taskFetcherStateRef.current = taskFetcher.state;
  }, [taskFetcher.state]);

  useEffect(() => {
    brandFetcherStateRef.current = brandFetcher.state;
  }, [brandFetcher.state]);

  useEffect(() => {
    brandPollAttemptsRef.current = 0;
  }, [projectId, setupTaskId]);

  useEffect(() => {
    if (step < 2 || !setupTaskId) return;
    let intervalId: number | null = null;

    const poll = () => {
      if (taskFetcherStateRef.current !== "idle") return;

      if (TERMINAL_TASK_STATUSES.has(taskStatusRef.current)) {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }

      taskFetcher.load(`/projects/setup-task/${encodeURIComponent(setupTaskId)}?ts=${Date.now()}`);
    };

    poll();
    intervalId = window.setInterval(poll, 2000);
    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [setupTaskId, step]);

  const prevCompletedStepsRef = useRef(taskCompletedSteps);
  useEffect(() => {
    if (step < 2 || !projectId) return;
    if (brandFetcher.state !== "idle") return;

    const prevSteps = prevCompletedStepsRef.current;
    prevCompletedStepsRef.current = taskCompletedSteps;

    if (taskCompletedSteps > prevSteps) {
      brandFetcher.load(`/projects/${projectId}/brand-visual-context?ts=${Date.now()}`);
    }
  }, [brandFetcher, brandFetcher.state, projectId, step, taskCompletedSteps]);

  useEffect(() => {
    if (step < 2 || !projectId || !isTaskCompleted) return;
    if (brand && hasBrandContextInsights) return;
    let intervalId: number | null = null;

    const pollBrand = () => {
      if (brandFetcherStateRef.current !== "idle") return;
      if (brandPollAttemptsRef.current >= 24) return;
      brandPollAttemptsRef.current += 1;
      brandFetcher.load(`/projects/${projectId}/brand-visual-context?ts=${Date.now()}`);
    };

    pollBrand();
    intervalId = window.setInterval(pollBrand, 5000);
    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [brand, hasBrandContextInsights, isTaskCompleted, projectId, step]);

  useEffect(() => {
    if (!expandedAsset) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedAsset(null);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [expandedAsset]);

  // Advance onboarding phase when transitioning between steps
  useEffect(() => {
    if (step === 2 && onboarding.isPhase("welcome")) {
      onboarding.advance({ projectId: projectId ?? undefined });
      setStrategyDismissed(false);
      setAuthorsDismissed(false);
    }
    if (step === 4 && onboarding.isPhase("strategy")) {
      onboarding.advance();
      setSetupDismissed(false);
    }
  }, [step]);

  useEffect(() => {
    if (step === 3) {
      setAuthorsDismissed(false);
    }
  }, [step]);

  // Re-show the setup bubble when the task completes
  useEffect(() => {
    if (isTaskCompleted && onboarding.isPhase("setup_progress")) {
      setSetupDismissed(false);
    }
  }, [isTaskCompleted]);

  function handleDomainChange(value: string) {
    const sanitized = sanitizeDomainInput(value);
    setDomain(sanitized);

    if (!nameDirty) {
      setName(suggestProjectNameFromDomain(sanitized));
    }
  }

  function updateAuthor(
    authorId: string,
    field: keyof Omit<AuthorDraft, "id">,
    value: string
  ) {
    setAuthors((previous) =>
      previous.map((author) =>
        author.id === authorId
          ? {
              ...author,
              [field]: value,
            }
          : author
      )
    );
  }

  function triggerAuthorImagePicker(authorId: string) {
    authorImageInputRefs.current[authorId]?.click();
  }

  function handleAuthorImageFileChange(authorId: string, files: FileList | null) {
    const file = files?.[0] ?? null;
    if (!file) return;

    setAuthorImageFileNames((previous) => ({
      ...previous,
      [authorId]: file.name,
    }));
  }

  const stepLabels = ["Basic project info", "Strategy + SEO inputs", "Authors (optional)", "Setup progress"];

  return (
    <div className="space-y-6" data-onboarding-focus="page-content">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Guided Setup</p>
          <h1 className="font-display text-3xl font-bold text-slate-900">Create a new pipeline project</h1>
        </div>
        <Link to="/project" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          Back to project
        </Link>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stepLabels.map((label, index) => {
              const stepNumber = index + 1;
              const active = stepNumber === step;
              const completed = stepNumber < step;

              return (
                <div
                  key={label}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    active
                      ? "border-[#2f6f71] bg-[#2f6f71]/10 text-[#1e5052]"
                      : completed
                        ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <span className="mr-2 text-xs">{String(stepNumber).padStart(2, "0")}</span>
                  {label}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {actionData?.error ? (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="pt-5 text-sm font-semibold text-rose-700">{actionData.error}</CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <motion.div key="step1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Form method="post" className="space-y-6">
            <input type="hidden" name="intent" value="bootstrapProject" />
            <input type="hidden" name="domain" value={domain} />
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="description" value={description} />

            <Card>
              <CardHeader>
                <CardTitle>Basic project info</CardTitle>
                <CardDescription>Create the project and initialize onboarding setup in the background.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm md:col-span-2">
                  <span className="font-semibold text-slate-700">Domain</span>
                  <div
                    className={`flex h-11 items-center rounded-xl border bg-white text-sm ${
                      domainError ? "border-rose-400" : "border-slate-300"
                    }`}
                  >
                    <span className="select-none pl-3 text-slate-400">https://</span>
                    <input
                      type="text"
                      value={domain}
                      onChange={(event) => handleDomainChange(event.target.value)}
                      placeholder="example.com"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-invalid={Boolean(domainError)}
                      className="h-full min-w-0 flex-1 rounded-r-xl border-0 bg-transparent px-1 pr-3 text-sm outline-none"
                    />
                  </div>
                  {domainError ? <span className="text-xs font-semibold text-rose-600">{domainError}</span> : null}
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">Project name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => {
                      setNameDirty(true);
                      setName(event.target.value);
                    }}
                    placeholder="Acme Growth Engine"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
                  />
                  {actionData?.fieldErrors?.name ? (
                    <span className="text-xs font-semibold text-rose-600">{actionData.fieldErrors.name}</span>
                  ) : null}
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">Description (optional)</span>
                  <input
                    type="text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="High-intent content pipeline"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
                  />
                </label>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={isSubmitting || !domainIsValid}>
                {isSubmitting ? "Setting up..." : "Next step"}
              </Button>
            </div>
          </Form>

          {onboarding.isPhase("welcome") && welcomeStep === "intro" && (
            <OnboardingOverlay
              onNext={() => setWelcomeStep("focus")}
              nextLabel="Let's go!"
            >
              <DonkeyBubble title="Welcome to Donkey SEO!">
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  I'm your professional<strong className="text-slate-800"> SEO assistant</strong>. I'll help you:
                </p>
                <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                    <span>Rank higher on <strong className="text-slate-800">Google search results</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                    <span>Get featured in <strong className="text-slate-800">Google's AI Overview</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                    <span>All on <strong className="text-slate-800">autopilot</strong>; minimal effort on your end</span>
                  </li>
                </ul>
              </DonkeyBubble>
            </OnboardingOverlay>
          )}

          {onboarding.isPhase("welcome") && welcomeStep === "focus" && (
            <OnboardingOverlay
              onNext={() => setWelcomeStep("done")}
              nextLabel="Got it!"
              focusSelector='[data-onboarding-focus="page-content"]'
            >
              <DonkeyBubble title="Let's set up your first project">
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Enter your <strong className="text-slate-800">website domain</strong> and I'll analyze your site to build a tailored SEO strategy.
                  The <strong className="text-slate-800">project name</strong> is auto-suggested from your domain.
                </p>
              </DonkeyBubble>
            </OnboardingOverlay>
          )}
        </motion.div>
      ) : null}

      {step === 2 ? (
        <motion.div key="step2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Form method="post" className="space-y-6">
            <input type="hidden" name="intent" value="updateProjectStrategy" />
            <input type="hidden" name="project_id" value={projectId ?? ""} />
            <input type="hidden" name="setup_run_id" value={setupRunId ?? ""} />
            <input type="hidden" name="setup_task_id" value={setupTaskId ?? ""} />
            <input type="hidden" name="preset" value={preset} />
            <input type="hidden" name="primary_locale" value={derivedLocale.locale} />
            <input type="hidden" name="primary_language" value={derivedLocale.language} />

            <Card>
              <CardHeader>
                <CardTitle>Preset constraints</CardTitle>
                <CardDescription>Choose a content strategy that matches your business goals.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {PRESET_OPTIONS.map((option) => {
                  const active = option.value === preset;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPreset(option.value)}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        active ? "border-[#2f6f71] bg-[#2f6f71]/10" : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <p className="font-display text-lg font-bold text-slate-900">{option.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{option.description}</p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Strategy + SEO inputs</CardTitle>
                <CardDescription>Set the target country for your content and SEO strategy.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">Target country</span>
                  <Select value={country} onChange={(event) => setCountry(event.target.value)}>
                    {COUNTRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to={retryLink}>
                <Button type="button" variant="outline">
                  Back
                </Button>
              </Link>
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save + continue"}
              </Button>
            </div>
          </Form>

          {onboarding.isPhase("strategy") && !strategyDismissed && (
            <OnboardingOverlay
              onNext={() => setStrategyDismissed(true)}
              nextLabel="Got it!"
            >
              <DonkeyBubble title="Pick your strategy">
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Choose a <strong className="text-slate-800">content strategy</strong> that matches your business goals:
                </p>
                <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#2f6f71]">&#x2022;</span>
                    <span><strong className="text-slate-800">Traffic Growth</strong>: maximize organic visibility</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#2f6f71]">&#x2022;</span>
                    <span><strong className="text-slate-800">Lead Generation</strong>: target buyer-intent queries</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#2f6f71]">&#x2022;</span>
                    <span><strong className="text-slate-800">Revenue Content</strong>: focus on money-page keywords</span>
                  </li>
                </ul>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Then select your <strong className="text-slate-800">target country</strong> and add optional author profiles in the next step.
                </p>
              </DonkeyBubble>
            </OnboardingOverlay>
          )}
        </motion.div>
      ) : null}

      {step === 3 ? (
        <motion.div key="step3-authors" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Form method="post" className="space-y-6">
            <input type="hidden" name="intent" value="saveProjectAuthors" />
            <input type="hidden" name="project_id" value={projectId ?? ""} />
            <input type="hidden" name="setup_run_id" value={setupRunId ?? ""} />
            <input type="hidden" name="setup_task_id" value={setupTaskId ?? ""} />
            <input type="hidden" name="authors_json" value={authorsPayloadJson} />

            <Card>
              <CardHeader>
                <CardTitle>Authors (optional)</CardTitle>
                <CardDescription>
                  Adding authors strengthens credibility and E-E-A-T signals. Articles can include consistent bylines, bios, and profile images from day one.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {authors.map((author, index) => (
                  <div key={author.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Author {index + 1}</p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm md:col-span-2">
                        <span className="font-semibold text-slate-700">Name</span>
                        <input
                          type="text"
                          value={author.name}
                          onChange={(event) => updateAuthor(author.id, "name", event.target.value)}
                          placeholder="Jane Doe"
                          className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
                        />
                      </label>

                      <label className="grid gap-1.5 text-sm md:col-span-2">
                        <span className="font-semibold text-slate-700">Bio</span>
                        <textarea
                          value={author.bio}
                          onChange={(event) => updateAuthor(author.id, "bio", event.target.value)}
                          placeholder="SEO strategist focused on B2B SaaS growth."
                          rows={3}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>

                      <div className="grid gap-1.5 text-sm md:col-span-2">
                        <span className="font-semibold text-slate-700">Profiles & socials</span>
                        <div className="grid gap-2 md:grid-cols-3">
                          <label className="relative">
                            <span className="sr-only">Blog or website URL</span>
                            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={author.website_url}
                              onChange={(event) => updateAuthor(author.id, "website_url", event.target.value)}
                              placeholder="Blog / website"
                              className="h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
                            />
                          </label>

                          <label className="relative">
                            <span className="sr-only">LinkedIn URL</span>
                            <Linkedin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={author.linkedin_url}
                              onChange={(event) => updateAuthor(author.id, "linkedin_url", event.target.value)}
                              placeholder="LinkedIn"
                              className="h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
                            />
                          </label>

                          <label className="relative">
                            <span className="sr-only">X or Twitter URL</span>
                            <Twitter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={author.twitter_url}
                              onChange={(event) => updateAuthor(author.id, "twitter_url", event.target.value)}
                              placeholder="X / Twitter"
                              className="h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="grid gap-1.5 text-sm md:col-span-2">
                        <span className="font-semibold text-slate-700">Profile image</span>
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            ref={(node) => {
                              authorImageInputRefs.current[author.id] = node;
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => handleAuthorImageFileChange(author.id, event.target.files)}
                          />
                          <Button type="button" variant="outline" onClick={() => triggerAuthorImagePicker(author.id)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload image
                          </Button>
                          <span className="text-xs text-slate-500">{authorImageFileNames[author.id] ?? "No file selected"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {actionData?.fieldErrors?.authors ? (
                  <p className="text-sm font-semibold text-rose-700">{actionData.fieldErrors.authors}</p>
                ) : null}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                to={buildOnboardingUrl({
                  step: 2,
                  projectId,
                  setupRunId,
                  setupTaskId,
                })}
              >
                <Button type="button" variant="outline">
                  Back
                </Button>
              </Link>
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Continue to scraping"}
              </Button>
            </div>
          </Form>

          {onboarding.isPhase("strategy") && !authorsDismissed && (
            <OnboardingOverlay
              onNext={() => setAuthorsDismissed(true)}
              nextLabel="Got it!"
            >
              <DonkeyBubble title="Add optional author profiles">
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Add real author details so generated articles include <strong className="text-slate-800">credible bylines</strong>.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  This strengthens perceived expertise and trust signals, which is good for SEO. Skip this step if you want and add authors later.
                </p>
              </DonkeyBubble>
            </OnboardingOverlay>
          )}
        </motion.div>
      ) : null}

      {step === 4 ? (
        <motion.div key="step4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Brand profile extraction</CardTitle>
              <CardDescription>
                We are fetching company name, ICP, product type, and scraped brand assets from your site.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Extraction status</p>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(task?.status)}`}>
                    {formatStatusLabel(task?.status ?? "queued")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {taskCurrentStepName
                    ? `Current step: ${taskCurrentStepName}`
                    : isTaskCompleted
                      ? "Setup complete. Loading brand profile data."
                      : "Analyzing your domain and extracting brand profile context."}
                </p>
                {taskTotalSteps ? (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {task?.stage ? `${formatStatusLabel(task.stage)} · ` : ""}Step {taskDisplayStep ?? 1} of {taskTotalSteps}
                  </p>
                ) : null}
                <div className="mt-4">
                  <Progress value={Math.max(0, Math.min(100, Math.round(taskProgress ?? 0)))} />
                </div>
                <p className="mt-2 text-right text-xs font-semibold text-[#1e5052]">
                  {typeof taskProgress !== "number" || Number.isNaN(taskProgress)
                    ? "Working..."
                    : `${Math.round(taskProgress)}%`}
                </p>
                {taskError ? <p className="mt-3 text-sm font-semibold text-rose-700">{taskError}</p> : null}
                {task?.error_message ? <p className="mt-3 text-sm font-semibold text-rose-700">{task.error_message}</p> : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Company name</p>
                  {!brand || (!companyName && !isTaskCompleted) ? (
                    <div className="mt-2 space-y-2">
                      <ShimmerPlaceholder className="h-5 w-48" />
                      <p className="text-xs text-slate-500">Extracting company identity from homepage and metadata.</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-slate-900">{companyName ?? "Not detected yet"}</p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Product type</p>
                  {!brand || (!productType && !isTaskCompleted) ? (
                    <div className="mt-2 space-y-2">
                      <ShimmerPlaceholder className="h-5 w-40" />
                      <p className="text-xs text-slate-500">Classifying offer model and category.</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-slate-900">{productType ?? "Not detected yet"}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Differentiators</p>
                  {!brand || (differentiators.length === 0 && !isTaskCompleted) ? (
                    <div className="mt-3 space-y-2">
                      <ShimmerPlaceholder className="h-4 w-full" />
                      <ShimmerPlaceholder className="h-4 w-11/12" />
                      <ShimmerPlaceholder className="h-4 w-4/5" />
                    </div>
                  ) : differentiators.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {differentiators.slice(0, 6).map((item) => (
                        <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">No differentiators returned yet.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Suggested ICP niches</p>
                  {!brand || (icpNicheNames.length === 0 && !isTaskCompleted) ? (
                    <div className="mt-3 space-y-2">
                      <ShimmerPlaceholder className="h-4 w-full" />
                      <ShimmerPlaceholder className="h-4 w-5/6" />
                    </div>
                  ) : icpNicheNames.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {icpNicheNames.slice(0, 8).map((niche) => (
                        <span
                          key={niche}
                          className="inline-flex items-center rounded-full border border-[#2f6f71]/30 bg-[#2f6f71]/10 px-2.5 py-1 text-xs font-semibold text-[#1e5052]"
                        >
                          {niche}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">No ICP niches returned yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Scraped assets</p>
                {!brand || ((!brand.brand_assets || brand.brand_assets.length === 0) && !isTaskCompleted) ? (
                  <div className="mt-3 space-y-2">
                    {[1, 2, 3].map((placeholder) => (
                      <div key={placeholder} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <ShimmerPlaceholder className="h-8 w-8 rounded-lg" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <ShimmerPlaceholder className="h-3 w-24" />
                            <ShimmerPlaceholder className="h-3 w-full" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : brand.brand_assets && brand.brand_assets.length > 0 ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {brand.brand_assets.slice(0, 6).map((asset) => (
                      <button
                        key={asset.asset_id}
                        type="button"
                        className="group rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition-colors hover:border-[#2f6f71]/50 hover:bg-white"
                        onClick={() => setExpandedAsset({ url: asset.source_url, role: asset.role })}
                      >
                        {assetImageErrors[asset.asset_id] ? (
                          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-100 px-2 text-center text-xs text-slate-600">
                            Preview unavailable
                          </div>
                        ) : (
                          <img
                            src={asset.source_url}
                            alt={asset.role}
                            loading="lazy"
                            className="h-24 w-full rounded-md border border-slate-200 object-cover bg-white"
                            onError={() =>
                              setAssetImageErrors((previous) => ({
                                ...previous,
                                [asset.asset_id]: true,
                              }))
                            }
                          />
                        )}
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{asset.role}</p>
                        <p className="truncate text-xs text-slate-600">{asset.source_url}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No scraped assets found yet.</p>
                )}
              </div>

              {isTaskFailureLike ? (
                <Card className="border-amber-300 bg-amber-50">
                  <CardContent className="space-y-3 pt-5">
                    <p className="text-sm font-semibold text-amber-900">
                      Setup paused or failed. Retry onboarding to resume brand profile extraction.
                    </p>
                    <Link to={retryLink}>
                      <Button type="button" variant="outline">
                        Retry bootstrap/setup
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : null}

            </CardContent>
          </Card>

          <Form method="post" className="flex flex-wrap items-center justify-between gap-3">
            <input type="hidden" name="intent" value="startDiscovery" />
            <input type="hidden" name="project_id" value={projectId ?? ""} />
            <input type="hidden" name="setup_run_id" value={setupRunId ?? ""} />
            <input type="hidden" name="setup_task_id" value={setupTaskId ?? ""} />

            <Link to={retryLink}>
              <Button type="button" variant="outline">
                Restart onboarding
              </Button>
            </Link>

            <Button type="submit" size="lg" disabled={!isTaskCompleted || isSubmitting}>
              {isSubmitting ? "Starting discovery..." : "Start Topic Discovery"}
            </Button>
          </Form>

          {onboarding.isPhase("setup_progress") && !setupDismissed && (
            <OnboardingOverlay
              onNext={() => setSetupDismissed(true)}
              nextLabel="Got it!"
            >
              <DonkeyBubble title={isTaskCompleted ? "Your brand profile is ready!" : "Analyzing your site..."}>
                {isTaskCompleted ? (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      I've extracted everything I need from your website:
                    </p>
                    <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-600">
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-600">&#x2713;</span>
                        <span><strong className="text-slate-800">Company details</strong> and brand identity</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-600">&#x2713;</span>
                        <span><strong className="text-slate-800">Differentiators</strong> and unique selling points</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-600">&#x2713;</span>
                        <span><strong className="text-slate-800">Target audience</strong> and ICP niches</span>
                      </li>
                    </ul>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                      Hit <strong className="text-slate-800">"Start Topic Discovery"</strong> to kick off your first research loop!
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      I'm crawling your website to build a <strong className="text-slate-800">brand profile</strong>. This powers everything: from keyword research to content generation.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      This usually takes about a minute. Feel free to watch the progress below!
                    </p>
                  </>
                )}
              </DonkeyBubble>
            </OnboardingOverlay>
          )}
        </motion.div>
      ) : null}

      {expandedAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close image preview"
            onClick={() => setExpandedAsset(null)}
          />
          <div className="relative z-10 w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{expandedAsset.role}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setExpandedAsset(null)}>
                Close
              </Button>
            </div>
            <img src={expandedAsset.url} alt={expandedAsset.role} className="max-h-[75vh] w-full rounded-lg border border-slate-200 object-contain" />
            <a
              href={expandedAsset.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-xs font-semibold text-[#1e5052] hover:underline"
            >
              Open source URL
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
