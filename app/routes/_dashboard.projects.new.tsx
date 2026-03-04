import { useEffect, useMemo, useRef, useState } from "react";
import { data, redirect, useActionData, useFetcher, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/_dashboard.projects.new";
import { RouteErrorBoundaryCard } from "~/components/errors/route-error-boundary";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import {
  buildPresetConstraints,
  isValidDomain,
  sanitizeDomainInput,
  suggestProjectNameFromDomain,
} from "~/lib/dashboard";
import { countryToLocale } from "~/lib/onboarding";
import { useOnboarding } from "~/components/onboarding/onboarding-context";
import {
  ExpandedAssetPreviewModal,
  SetupActionErrorCard,
  SetupPageHeader,
  SetupStepTracker,
  StepFourIntegrationsStep,
  StepFiveSetupProgressStep,
  StepOneProjectInfoStep,
  StepThreeAuthorsStep,
  StepTwoSeoInputsStep,
  type AuthorDraft,
  type AuthorImageUploadStatus,
  type BrandVisualContextResponse,
  type ExpandedAsset,
  type LocaleSelection,
  type ProjectApiKeyResponse,
  type ProjectWebhookSecretResponse,
  type SetupStep,
  type TaskStatusResponse,
} from "~/components/features/project-setup";
import {
  DEFAULT_POSTS_PER_WEEK,
  FAILURE_LIKE_TASK_STATUSES,
  MAX_POSTS_PER_WEEK,
  MIN_POSTS_PER_WEEK,
  TERMINAL_TASK_STATUSES,
  buildAuthorMutationPayload,
  buildOnboardingUrl,
  clampPostsPerWeek,
  createEmptyAuthorDraft,
  extractDifferentiators,
  extractIcpNicheNames,
  getBrandContextValue,
  hasAuthorDraftContent,
  normalizeOptionalString,
  parseOnboardingAuthorRecord,
  parseOnboardingAuthors,
  parsePostsPerWeek,
  parseStep,
} from "~/components/features/project-setup/utils";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type ProjectUpdate = components["schemas"]["ProjectUpdate"];
type ProjectOnboardingBootstrapRequest = components["schemas"]["ProjectOnboardingBootstrapRequest"];
type ProjectOnboardingBootstrapResponse = components["schemas"]["ProjectOnboardingBootstrapResponse"];
type AuthorResponse = components["schemas"]["AuthorResponse"];
type AuthorProfileImageSignedUploadRequest = components["schemas"]["AuthorProfileImageSignedUploadRequest"];
type AuthorProfileImageSignedUploadResponse = components["schemas"]["AuthorProfileImageSignedUploadResponse"];

type LoaderData = {
  step: SetupStep;
  projectId: string | null;
  setupRunId: string | null;
  setupTaskId: string | null;
  project: ProjectResponse | null;
  integrationGuide: string | null;
  prefill: {
    domain: string;
    name: string;
    description: string;
    posts_per_week: number;
  };
};

type ActionData = {
  error?: string;
  generatedKey?: ProjectApiKeyResponse;
  generatedWebhookSecret?: ProjectWebhookSecretResponse;
  fieldErrors?: {
    domain?: string;
    name?: string;
    posts_per_week?: string;
    authors?: string;
  };
};

type AuthorImageUploadActionResponse = {
  error?: string;
  author_client_id?: string;
  author_id?: string;
  upload?: AuthorProfileImageSignedUploadResponse;
  uploaded?: boolean;
  profile_image_object_key?: string;
  profile_image_mime_type?: string;
};

type PreparedAuthorImageUpload = AuthorImageUploadActionResponse & {
  author_id: string;
  upload: AuthorProfileImageSignedUploadResponse;
};

type TaskStatusLoaderData = {
  task: TaskStatusResponse | null;
  error?: string;
};

type BrandVisualContextLoaderData = {
  brand: BrandVisualContextResponse | null;
  error?: string;
};

const INTEGRATION_GUIDE_PATH = "/integration/guide/donkey-client.md";

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
    posts_per_week:
      parsePostsPerWeek(url.searchParams.get("posts_per_week")) ??
      DEFAULT_POSTS_PER_WEEK,
  };

  if (step > 1 && (!projectId || !setupRunId || !setupTaskId)) {
    return data(
      {
        step: 1,
        projectId: null,
        setupRunId: null,
        setupTaskId: null,
        project: null,
        integrationGuide: null,
        prefill,
      } satisfies LoaderData,
      { headers: await api.commit() }
    );
  }

  let project: ProjectResponse | null = null;
  let integrationGuide: string | null = null;
  if (projectId) {
    const projectResponse = await api.fetch(`/projects/${projectId}`);
    if (projectResponse.status === 401) return handleUnauthorized(api);
    if (projectResponse.ok) {
      project = (await projectResponse.json()) as ProjectResponse;
    }
  }

  if (step >= 4) {
    const guideResponse = await api.fetch(INTEGRATION_GUIDE_PATH);
    if (guideResponse.status === 401) return handleUnauthorized(api);
    if (guideResponse.ok) {
      integrationGuide = await guideResponse.text();
    }
  }

  return data(
    {
      step,
      projectId,
      setupRunId,
      setupTaskId,
      project,
      integrationGuide,
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
    const postsPerWeek = parsePostsPerWeek(formData.get("posts_per_week")) ?? DEFAULT_POSTS_PER_WEEK;

    const domainMissing = !domain;
    const domainInvalid = !domainMissing && !isValidDomain(domain);
    if (domainMissing || domainInvalid || !name) {
      return data(
        {
          error: domainInvalid
            ? "Please enter a valid domain."
            : "Project name and domain are required.",
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
      posts_per_week: postsPerWeek,
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
    const postsPerWeek = parsePostsPerWeek(formData.get("posts_per_week"));

    if (!projectId || !setupRunId || !setupTaskId) {
      return data({ error: "Missing onboarding context." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    if (postsPerWeek === null) {
      return data(
        {
          error: "Choose how many posts to publish per week.",
          fieldErrors: { posts_per_week: `Choose a value between ${MIN_POSTS_PER_WEEK} and ${MAX_POSTS_PER_WEEK}.` },
        } satisfies ActionData,
        {
          status: 400,
          headers: await api.commit(),
        }
      );
    }

    const updatePayload: ProjectUpdate = {
      primary_language: primaryLanguage,
      primary_locale: primaryLocale,
      posts_per_week: postsPerWeek,
      constraints: buildPresetConstraints("traffic_growth"),
    };

    const updateResponse = await api.fetch(`/projects/${projectId}`, {
      method: "PUT",
      json: updatePayload,
    });

    if (updateResponse.status === 401) return handleUnauthorized(api);

    if (!updateResponse.ok) {
      const apiMessage = await readApiErrorMessage(updateResponse);
      return data(
        { error: apiMessage ?? "Unable to update project settings." } satisfies ActionData,
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
      const payload = buildAuthorMutationPayload(author);

      if (author.persisted_author_id) {
        const updateAuthorResponse = await api.fetch(`/authors/${projectId}/${author.persisted_author_id}`, {
          method: "PATCH",
          json: payload,
        });

        if (updateAuthorResponse.status === 401) return handleUnauthorized(api);

        if (!updateAuthorResponse.ok) {
          const apiMessage = await readApiErrorMessage(updateAuthorResponse);
          return data(
            { error: apiMessage ?? "Unable to update project authors." } satisfies ActionData,
            { status: updateAuthorResponse.status, headers: await api.commit() }
          );
        }
        continue;
      }

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

  if (intent === "generateProjectApiKey") {
    const projectId = String(formData.get("project_id") ?? "").trim();
    if (!projectId) {
      return data({ error: "Missing project context." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    const response = await api.fetch(`/projects/${encodeURIComponent(projectId)}/api-key`, {
      method: "POST",
    });

    if (response.status === 401) return handleUnauthorized(api);

    if (!response.ok) {
      const apiMessage = await readApiErrorMessage(response);
      return data(
        {
          error: apiMessage ?? "Unable to generate a new API key right now.",
        } satisfies ActionData,
        {
          status: response.status,
          headers: await api.commit(),
        }
      );
    }

    const generatedKey = (await response.json()) as ProjectApiKeyResponse;
    return data(
      {
        generatedKey,
      } satisfies ActionData,
      {
        headers: await api.commit(),
      }
    );
  }

  if (intent === "generateProjectWebhookSecret") {
    const projectId = String(formData.get("project_id") ?? "").trim();
    if (!projectId) {
      return data({ error: "Missing project context." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    const response = await api.fetch(`/projects/${encodeURIComponent(projectId)}/webhook-secret`, {
      method: "POST",
    });

    if (response.status === 401) return handleUnauthorized(api);

    if (!response.ok) {
      const apiMessage = await readApiErrorMessage(response);
      return data(
        {
          error: apiMessage ?? "Unable to generate webhook secret right now.",
        } satisfies ActionData,
        {
          status: response.status,
          headers: await api.commit(),
        }
      );
    }

    const generatedWebhookSecret = (await response.json()) as ProjectWebhookSecretResponse;
    return data(
      {
        generatedWebhookSecret,
      } satisfies ActionData,
      {
        headers: await api.commit(),
      }
    );
  }

  if (intent === "continueAfterIntegrations") {
    const projectId = String(formData.get("project_id") ?? "").trim();
    const setupRunId = String(formData.get("setup_run_id") ?? "").trim();
    const setupTaskId = String(formData.get("setup_task_id") ?? "").trim();

    if (!projectId || !setupRunId || !setupTaskId) {
      return data({ error: "Missing onboarding context." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    return redirect(
      buildOnboardingUrl({
        step: 5,
        projectId,
        setupRunId,
        setupTaskId,
      }),
      { headers: await api.commit() }
    );
  }

  if (intent === "prepareAuthorImageUpload") {
    const projectId = String(formData.get("project_id") ?? "").trim();
    const authorClientId = String(formData.get("author_client_id") ?? "").trim();
    const authorJson = String(formData.get("author_json") ?? "").trim();
    const contentType = String(formData.get("content_type") ?? "").trim();

    if (!projectId || !authorClientId || !authorJson || !contentType) {
      return data(
        { error: "Missing image upload context." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    if (!contentType.toLowerCase().startsWith("image/")) {
      return data(
        { error: "Profile image must be a valid image MIME type." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    let parsedAuthorValue: unknown;
    try {
      parsedAuthorValue = JSON.parse(authorJson);
    } catch {
      return data(
        { error: "Invalid author payload." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    const { author, error } = parseOnboardingAuthorRecord(parsedAuthorValue, 0);
    if (error || !author) {
      return data(
        { error: error ?? "Author details are required before uploading an image." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    let authorId = author.persisted_author_id;
    const authorPayload = buildAuthorMutationPayload(author);

    if (authorId) {
      const updateAuthorResponse = await api.fetch(`/authors/${projectId}/${authorId}`, {
        method: "PATCH",
        json: authorPayload,
      });

      if (updateAuthorResponse.status === 401) return handleUnauthorized(api);

      if (!updateAuthorResponse.ok) {
        const apiMessage = await readApiErrorMessage(updateAuthorResponse);
        return data(
          { error: apiMessage ?? "Unable to prepare author image upload." } satisfies AuthorImageUploadActionResponse,
          { status: updateAuthorResponse.status, headers: await api.commit() }
        );
      }
    } else {
      const createAuthorResponse = await api.fetch(`/authors/${projectId}`, {
        method: "POST",
        json: authorPayload,
      });

      if (createAuthorResponse.status === 401) return handleUnauthorized(api);

      if (!createAuthorResponse.ok) {
        const apiMessage = await readApiErrorMessage(createAuthorResponse);
        return data(
          { error: apiMessage ?? "Unable to create author before image upload." } satisfies AuthorImageUploadActionResponse,
          { status: createAuthorResponse.status, headers: await api.commit() }
        );
      }

      const createdAuthor = (await createAuthorResponse.json()) as AuthorResponse;
      authorId = createdAuthor.id;
    }

    if (!authorId) {
      return data(
        { error: "Unable to determine author ID for image upload." } satisfies AuthorImageUploadActionResponse,
        { status: 500, headers: await api.commit() }
      );
    }

    const signedUploadPayload: AuthorProfileImageSignedUploadRequest = {
      content_type: contentType,
    };
    const signedUploadResponse = await api.fetch(
      `/authors/${projectId}/${authorId}/profile-image/signed-upload-url`,
      {
        method: "POST",
        json: signedUploadPayload,
      }
    );

    if (signedUploadResponse.status === 401) return handleUnauthorized(api);

    if (!signedUploadResponse.ok) {
      const apiMessage = await readApiErrorMessage(signedUploadResponse);
      return data(
        { error: apiMessage ?? "Unable to mint a signed upload URL." } satisfies AuthorImageUploadActionResponse,
        { status: signedUploadResponse.status, headers: await api.commit() }
      );
    }

    const upload = (await signedUploadResponse.json()) as AuthorProfileImageSignedUploadResponse;
    return data(
      {
        author_client_id: authorClientId,
        author_id: authorId,
        upload,
      } satisfies AuthorImageUploadActionResponse,
      { headers: await api.commit() }
    );
  }

  if (intent === "proxyAuthorImageUpload") {
    const authorClientId = String(formData.get("author_client_id") ?? "").trim();
    const authorId = String(formData.get("author_id") ?? "").trim();
    const uploadJson = String(formData.get("upload_json") ?? "").trim();
    const uploadedFile = formData.get("file");

    if (!authorId || !uploadJson || !(uploadedFile instanceof File)) {
      return data(
        { error: "Missing image upload context." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    const contentType = (uploadedFile.type || "").trim();
    if (!contentType.toLowerCase().startsWith("image/")) {
      return data(
        { error: "Profile image must be a valid image MIME type." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    let parsedUploadValue: unknown;
    try {
      parsedUploadValue = JSON.parse(uploadJson);
    } catch {
      return data(
        { error: "Invalid signed upload payload." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    if (!parsedUploadValue || typeof parsedUploadValue !== "object") {
      return data(
        { error: "Invalid signed upload payload." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    const uploadRecord = parsedUploadValue as Record<string, unknown>;
    const uploadUrl = normalizeOptionalString(uploadRecord.upload_url);
    const uploadMethod = normalizeOptionalString(uploadRecord.upload_method) ?? "PUT";
    const objectKey = normalizeOptionalString(uploadRecord.object_key);
    const requiredHeadersValue =
      typeof uploadRecord.required_headers === "object" && uploadRecord.required_headers !== null
        ? (uploadRecord.required_headers as Record<string, unknown>)
        : {};

    if (!uploadUrl || !objectKey) {
      return data(
        { error: "Invalid signed upload payload." } satisfies AuthorImageUploadActionResponse,
        { status: 400, headers: await api.commit() }
      );
    }

    const uploadHeaders = new Headers();
    for (const [key, value] of Object.entries(requiredHeadersValue)) {
      if (typeof value === "string") uploadHeaders.set(key, value);
    }
    if (!uploadHeaders.has("Content-Type")) {
      uploadHeaders.set("Content-Type", contentType);
    }

    const binaryBody = new Uint8Array(await uploadedFile.arrayBuffer());
    const uploadResponse = await fetch(uploadUrl, {
      method: uploadMethod,
      headers: uploadHeaders,
      body: binaryBody,
    });

    if (!uploadResponse.ok) {
      return data(
        { error: `Image upload failed (${uploadResponse.status}).` } satisfies AuthorImageUploadActionResponse,
        { status: uploadResponse.status, headers: await api.commit() }
      );
    }

    return data(
      {
        author_client_id: authorClientId || undefined,
        author_id: authorId,
        uploaded: true,
        profile_image_object_key: objectKey,
        profile_image_mime_type: contentType,
      } satisfies AuthorImageUploadActionResponse,
      { headers: await api.commit() }
    );
  }

  return data({ error: "Unsupported action." } satisfies ActionData, {
    status: 400,
    headers: await api.commit(),
  });
}

export default function ProjectSetupRoute() {
  const { step, project, projectId, setupRunId, setupTaskId, integrationGuide, prefill } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const taskFetcher = useFetcher<TaskStatusLoaderData>();
  const brandFetcher = useFetcher<BrandVisualContextLoaderData>();
  const authorImagePreparationFetcher = useFetcher<AuthorImageUploadActionResponse>();

  const [domain, setDomain] = useState(prefill.domain);
  const [name, setName] = useState(prefill.name);
  const [description, setDescription] = useState(prefill.description);
  const [postsPerWeek, setPostsPerWeek] = useState(() =>
    clampPostsPerWeek(project?.posts_per_week ?? prefill.posts_per_week ?? DEFAULT_POSTS_PER_WEEK)
  );
  const [nameDirty, setNameDirty] = useState(Boolean(prefill.name));
  const [expandedAsset, setExpandedAsset] = useState<ExpandedAsset | null>(null);
  const [assetImageErrors, setAssetImageErrors] = useState<Record<string, boolean>>({});

  const [country, setCountry] = useState("worldwide");
  const [authors, setAuthors] = useState<AuthorDraft[]>([createEmptyAuthorDraft("author-1")]);
  const authorImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [authorImageFileNames, setAuthorImageFileNames] = useState<Record<string, string>>({});
  const [authorImagePreviewUrls, setAuthorImagePreviewUrls] = useState<Record<string, string>>({});
  const authorImagePreviewUrlsRef = useRef<Record<string, string>>({});
  const [authorImageUploadStatuses, setAuthorImageUploadStatuses] = useState<Record<string, AuthorImageUploadStatus>>({});
  const pendingAuthorImagePreparationRef = useRef<{
    resolve: (response: PreparedAuthorImageUpload) => void;
    reject: (reason: Error) => void;
  } | null>(null);

  const onboarding = useOnboarding();
  const [welcomeStep, setWelcomeStep] = useState<"intro" | "focus" | "done">("intro");
  const [strategyDismissed, setStrategyDismissed] = useState(false);
  const [authorsDismissed, setAuthorsDismissed] = useState(false);
  const [integrationsDismissed, setIntegrationsDismissed] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);

  const derivedLocale = useMemo<LocaleSelection>(() => countryToLocale(country), [country]);

  const isSubmitting = navigation.state !== "idle";
  const domainIsValid = isValidDomain(domain);
  const inlineDomainError = domain.length > 0 && !domainIsValid ? "Enter a valid domain (e.g. example.com)." : null;
  const domainError = domainIsValid ? null : actionData?.fieldErrors?.domain ?? inlineDomainError;
  const postsPerWeekError = actionData?.fieldErrors?.posts_per_week ?? null;
  const generatedKey = actionData?.generatedKey ?? null;
  const generatedWebhookSecret = actionData?.generatedWebhookSecret ?? null;
  const currentIntent = navigation.formData?.get("intent")?.toString() ?? "";
  const isGeneratingApiKey = navigation.state !== "idle" && currentIntent === "generateProjectApiKey";
  const isGeneratingWebhookSecret = navigation.state !== "idle" && currentIntent === "generateProjectWebhookSecret";
  const isContinuingAfterIntegrations = navigation.state !== "idle" && currentIntent === "continueAfterIntegrations";
  const authorsPayloadJson = useMemo(() => {
    const normalizedAuthors = authors
      .filter((author) => hasAuthorDraftContent(author))
      .map((author) => ({
        persisted_author_id: author.persisted_author_id.trim(),
        name: author.name.trim(),
        bio: author.bio.trim(),
        website_url: author.website_url.trim(),
        linkedin_url: author.linkedin_url.trim(),
        twitter_url: author.twitter_url.trim(),
        profile_image_source_url: author.profile_image_source_url.trim(),
        profile_image_object_key: author.profile_image_object_key.trim(),
        profile_image_mime_type: author.profile_image_mime_type.trim(),
      }));

    return JSON.stringify(normalizedAuthors);
  }, [authors]);
  const hasPendingAuthorImageUpload = useMemo(() => {
    return Object.values(authorImageUploadStatuses).some(
      (status) => status.state === "preparing" || status.state === "uploading"
    );
  }, [authorImageUploadStatuses]);

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
        posts_per_week: project?.posts_per_week ?? postsPerWeek,
      },
    });
  }, [description, domain, name, postsPerWeek, project?.description, project?.domain, project?.name, project?.posts_per_week]);

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
    authorImagePreviewUrlsRef.current = authorImagePreviewUrls;
  }, [authorImagePreviewUrls]);

  useEffect(() => {
    if (authorImagePreparationFetcher.state !== "idle") return;

    const pendingPreparation = pendingAuthorImagePreparationRef.current;
    if (!pendingPreparation) return;

    pendingAuthorImagePreparationRef.current = null;
    const payload = authorImagePreparationFetcher.data;

    if (!payload || !payload.upload || !payload.author_id) {
      pendingPreparation.reject(new Error(payload?.error ?? "Unable to prepare image upload."));
      return;
    }

    pendingPreparation.resolve(payload as PreparedAuthorImageUpload);
  }, [authorImagePreparationFetcher.data, authorImagePreparationFetcher.state]);

  useEffect(() => {
    return () => {
      const pendingPreparation = pendingAuthorImagePreparationRef.current;
      if (!pendingPreparation) return;

      pendingAuthorImagePreparationRef.current = null;
      pendingPreparation.reject(new Error("Image upload preparation was interrupted."));
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(authorImagePreviewUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => {
    brandPollAttemptsRef.current = 0;
  }, [projectId, setupTaskId]);

  useEffect(() => {
    if (step !== 5 || !setupTaskId) return;
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
      setIntegrationsDismissed(false);
    }
    if (step === 5 && onboarding.isPhase("strategy")) {
      onboarding.advance();
      setSetupDismissed(false);
    }
  }, [step]);

  useEffect(() => {
    if (step === 3) {
      setAuthorsDismissed(false);
    }
    if (step === 4) {
      setIntegrationsDismissed(false);
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

  function prepareAuthorImageUpload(formPayload: FormData): Promise<PreparedAuthorImageUpload> {
    if (pendingAuthorImagePreparationRef.current) {
      return Promise.reject(new Error("Another image upload is already being prepared."));
    }

    return new Promise((resolve, reject) => {
      pendingAuthorImagePreparationRef.current = { resolve, reject };
      try {
        authorImagePreparationFetcher.submit(formPayload, {
          method: "post",
          encType: "multipart/form-data",
        });
      } catch (error) {
        pendingAuthorImagePreparationRef.current = null;
        reject(error instanceof Error ? error : new Error("Unable to prepare image upload."));
      }
    });
  }

  async function proxyAuthorImageUpload(
    authorClientId: string,
    authorId: string,
    upload: AuthorProfileImageSignedUploadResponse,
    file: File
  ) {
    const formPayload = new FormData();
    formPayload.set("intent", "proxyAuthorImageUpload");
    formPayload.set("author_client_id", authorClientId);
    formPayload.set("author_id", authorId);
    formPayload.set("upload_json", JSON.stringify(upload));
    formPayload.set("file", file);

    const actionUrl = `${window.location.pathname}${window.location.search}`;
    const response = await fetch(actionUrl, {
      method: "POST",
      body: formPayload,
      credentials: "same-origin",
    });

    let payload: AuthorImageUploadActionResponse | null = null;
    try {
      payload = (await response.json()) as AuthorImageUploadActionResponse;
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.error) {
      throw new Error(payload?.error ?? `Image upload failed (${response.status}).`);
    }
  }

  function markAuthorImageUploadSuccess(authorId: string, file: File) {
    const previewUrl = URL.createObjectURL(file);
    setAuthorImagePreviewUrls((previous) => {
      const priorPreviewUrl = previous[authorId];
      if (priorPreviewUrl) {
        URL.revokeObjectURL(priorPreviewUrl);
      }
      return {
        ...previous,
        [authorId]: previewUrl,
      };
    });
    setAuthorImageUploadStatuses((previous) => ({
      ...previous,
      [authorId]: { state: "uploaded", message: "Image uploaded successfully." },
    }));
  }

  async function handleAuthorImageFileChange(authorId: string, files: FileList | null) {
    const file = files?.[0] ?? null;
    if (!file) return;

    const authorDraft = authors.find((author) => author.id === authorId);
    if (!authorDraft) return;

    if (!projectId) {
      setAuthorImageUploadStatuses((previous) => ({
        ...previous,
        [authorId]: { state: "error", message: "Project context is missing. Please refresh and try again." },
      }));
      return;
    }

    if (!authorDraft.name.trim()) {
      setAuthorImageUploadStatuses((previous) => ({
        ...previous,
        [authorId]: { state: "error", message: "Add the author name before uploading a profile image." },
      }));
      return;
    }

    setAuthorImageFileNames((previous) => ({
      ...previous,
      [authorId]: file.name,
    }));

    setAuthorImageUploadStatuses((previous) => ({
      ...previous,
      [authorId]: { state: "preparing", message: "Requesting secure upload URL..." },
    }));

    const authorPayload = {
      persisted_author_id: authorDraft.persisted_author_id.trim(),
      name: authorDraft.name.trim(),
      bio: authorDraft.bio.trim(),
      website_url: authorDraft.website_url.trim(),
      linkedin_url: authorDraft.linkedin_url.trim(),
      twitter_url: authorDraft.twitter_url.trim(),
      profile_image_source_url: authorDraft.profile_image_source_url.trim(),
      profile_image_object_key: authorDraft.profile_image_object_key.trim(),
      profile_image_mime_type: authorDraft.profile_image_mime_type.trim(),
    };

    const formPayload = new FormData();
    formPayload.set("intent", "prepareAuthorImageUpload");
    formPayload.set("project_id", projectId);
    formPayload.set("author_client_id", authorId);
    formPayload.set("author_json", JSON.stringify(authorPayload));
    formPayload.set("content_type", file.type || "application/octet-stream");

    let uploadPreparation: PreparedAuthorImageUpload;
    try {
      uploadPreparation = await prepareAuthorImageUpload(formPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare image upload.";
      setAuthorImageUploadStatuses((previous) => ({
        ...previous,
        [authorId]: { state: "error", message },
      }));
      return;
    }

    setAuthors((previous) =>
      previous.map((author) =>
        author.id === authorId
          ? {
              ...author,
              persisted_author_id: uploadPreparation.author_id ?? author.persisted_author_id,
              profile_image_object_key: uploadPreparation.upload?.object_key ?? author.profile_image_object_key,
              profile_image_mime_type: file.type || author.profile_image_mime_type,
            }
          : author
      )
    );

    setAuthorImageUploadStatuses((previous) => ({
      ...previous,
      [authorId]: { state: "uploading", message: "Uploading image..." },
    }));

    try {
      const uploadHeaders = new Headers();
      const requiredHeaders = uploadPreparation.upload.required_headers ?? {};
      for (const [key, value] of Object.entries(requiredHeaders)) {
        uploadHeaders.set(key, value);
      }
      if (file.type && !uploadHeaders.has("Content-Type")) {
        uploadHeaders.set("Content-Type", file.type);
      }

      const uploadResponse = await fetch(uploadPreparation.upload.upload_url, {
        method: uploadPreparation.upload.upload_method || "PUT",
        headers: uploadHeaders,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Image upload failed (${uploadResponse.status}).`);
      }
      markAuthorImageUploadSuccess(authorId, file);
    } catch (error) {
      setAuthorImageUploadStatuses((previous) => ({
        ...previous,
        [authorId]: { state: "uploading", message: "Direct upload failed, retrying through server relay..." },
      }));

      try {
        await proxyAuthorImageUpload(authorId, uploadPreparation.author_id, uploadPreparation.upload, file);
        markAuthorImageUploadSuccess(authorId, file);
      } catch (relayError) {
        const message = relayError instanceof Error ? relayError.message : "Image upload failed.";
        setAuthorImageUploadStatuses((previous) => ({
          ...previous,
          [authorId]: { state: "error", message },
        }));
      }
    }

    if (authorImageInputRefs.current[authorId]) {
      authorImageInputRefs.current[authorId]!.value = "";
    }
  }

  const stepThreeBackLink = buildOnboardingUrl({
    step: 2,
    projectId,
    setupRunId,
    setupTaskId,
  });
  const stepFourBackLink = buildOnboardingUrl({
    step: 3,
    projectId,
    setupRunId,
    setupTaskId,
  });

  return (
    <div className="space-y-6" data-onboarding-focus="page-content">
      <SetupPageHeader />
      <SetupStepTracker step={step} />
      <SetupActionErrorCard error={actionData?.error} />

      {step === 1 ? (
        <StepOneProjectInfoStep
          domain={domain}
          name={name}
          description={description}
          postsPerWeek={postsPerWeek}
          domainError={domainError}
          nameError={actionData?.fieldErrors?.name}
          isSubmitting={isSubmitting}
          domainIsValid={domainIsValid}
          onDomainChange={handleDomainChange}
          onNameChange={(value) => {
            setNameDirty(true);
            setName(value);
          }}
          onDescriptionChange={setDescription}
          showWelcomeIntro={onboarding.isPhase("welcome") && welcomeStep === "intro"}
          showWelcomeFocus={onboarding.isPhase("welcome") && welcomeStep === "focus"}
          onWelcomeIntroNext={() => setWelcomeStep("focus")}
          onWelcomeFocusNext={() => setWelcomeStep("done")}
        />
      ) : null}

      {step === 2 ? (
        <StepTwoSeoInputsStep
          projectId={projectId}
          setupRunId={setupRunId}
          setupTaskId={setupTaskId}
          derivedLocale={derivedLocale}
          country={country}
          postsPerWeek={postsPerWeek}
          postsPerWeekError={postsPerWeekError}
          retryLink={retryLink}
          isSubmitting={isSubmitting}
          showStrategyOverlay={onboarding.isPhase("strategy") && !strategyDismissed}
          onCountryChange={setCountry}
          onPostsPerWeekChange={setPostsPerWeek}
          onDismissStrategyOverlay={() => setStrategyDismissed(true)}
        />
      ) : null}

      {step === 3 ? (
        <StepThreeAuthorsStep
          projectId={projectId}
          setupRunId={setupRunId}
          setupTaskId={setupTaskId}
          authors={authors}
          authorsPayloadJson={authorsPayloadJson}
          authorsFieldError={actionData?.fieldErrors?.authors}
          isSubmitting={isSubmitting}
          hasPendingAuthorImageUpload={hasPendingAuthorImageUpload}
          backLink={stepThreeBackLink}
          showAuthorsOverlay={onboarding.isPhase("strategy") && !authorsDismissed}
          onAuthorChange={updateAuthor}
          onAuthorImageInputRef={(authorId, node) => {
            authorImageInputRefs.current[authorId] = node;
          }}
          onAuthorImagePickerClick={triggerAuthorImagePicker}
          onAuthorImageFileChange={(authorId, files) => {
            void handleAuthorImageFileChange(authorId, files);
          }}
          authorImagePreviewUrls={authorImagePreviewUrls}
          authorImageFileNames={authorImageFileNames}
          authorImageUploadStatuses={authorImageUploadStatuses}
          onDismissAuthorsOverlay={() => setAuthorsDismissed(true)}
        />
      ) : null}

      {step === 4 ? (
        <StepFourIntegrationsStep
          projectId={projectId}
          setupRunId={setupRunId}
          setupTaskId={setupTaskId}
          backLink={stepFourBackLink}
          generatedKey={generatedKey}
          generatedWebhookSecret={generatedWebhookSecret}
          integrationGuide={integrationGuide}
          isGeneratingApiKey={isGeneratingApiKey}
          isGeneratingWebhookSecret={isGeneratingWebhookSecret}
          isContinuing={isContinuingAfterIntegrations}
          showIntegrationsOverlay={onboarding.isPhase("strategy") && !integrationsDismissed}
          onDismissIntegrationsOverlay={() => setIntegrationsDismissed(true)}
        />
      ) : null}

      {step === 5 ? (
        <StepFiveSetupProgressStep
          projectId={projectId}
          task={task}
          taskCurrentStepName={taskCurrentStepName}
          taskTotalSteps={taskTotalSteps}
          taskDisplayStep={taskDisplayStep}
          taskProgress={taskProgress}
          taskError={taskError}
          isTaskCompleted={isTaskCompleted}
          isTaskFailureLike={isTaskFailureLike}
          brand={brand}
          companyName={companyName}
          productType={productType}
          differentiators={differentiators}
          icpNicheNames={icpNicheNames}
          retryLink={retryLink}
          assetImageErrors={assetImageErrors}
          onAssetImageError={(assetId) =>
            setAssetImageErrors((previous) => ({
              ...previous,
              [assetId]: true,
            }))
          }
          onExpandedAssetChange={setExpandedAsset}
          showSetupOverlay={onboarding.isPhase("setup_progress") && !setupDismissed}
          onDismissSetupOverlay={() => setSetupDismissed(true)}
        />
      ) : null}

      <ExpandedAssetPreviewModal expandedAsset={expandedAsset} onClose={() => setExpandedAsset(null)} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteErrorBoundaryCard
      error={error}
      variant="panel"
      title="Project setup unavailable"
      description="The new project onboarding flow failed to load."
      safeHref="/project"
      safeLabel="Back to dashboard"
      retryLabel="Retry setup flow"
      showStatus
    />
  );
}
