import { useEffect, useState } from "react";
import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { Check, Loader2, RefreshCw, Key, Webhook, Bot, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import { formatDateTime } from "~/lib/dashboard";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";

type ProjectListResponse = components["schemas"]["ProjectListResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type ProjectApiKeyResponse = components["schemas"]["ProjectApiKeyResponse"];
type ProjectWebhookSecretResponse = components["schemas"]["ProjectWebhookSecretResponse"];
type ProjectUpdate = components["schemas"]["ProjectUpdate"];

type ProjectSummary = Pick<ProjectResponse, "id" | "name" | "domain" | "status">;

type LoaderData = {
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  fullProject: ProjectResponse | null;
  guideContent: string | null;
};

type ActionData = {
  error?: string;
  success?: string;
  generatedKey?: ProjectApiKeyResponse;
  generatedWebhookSecret?: ProjectWebhookSecretResponse;
  webhookSaved?: boolean;
};

type SettingsTab = "overview" | "api-keys" | "webhooks" | "ai-guide";

const ACTIVE_PROJECT_SESSION_KEY = "activeProjectId";

function normalizeSessionProjectId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseOnboardingTab(value: string | null): SettingsTab | null {
  if (value === "overview" || value === "api-keys" || value === "webhooks" || value === "ai-guide") {
    return value;
  }
  return null;
}

export async function loader({ request }: { request: Request }) {
  const api = new ApiClient(request);
  await api.requireUser();

  const projectsResponse = await api.fetch("/projects/?page=1&page_size=100");
  if (projectsResponse.status === 401) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  if (!projectsResponse.ok) {
    throw new Response("Failed to load projects.", { status: projectsResponse.status });
  }

  const projectsPayload = (await projectsResponse.json()) as ProjectListResponse;
  const projectItems = (projectsPayload.items ?? []) as ProjectResponse[];
  const projects = projectItems.map((project) => ({
    id: project.id,
    name: project.name,
    domain: project.domain,
    status: project.status,
  }));

  const sessionProjectId = normalizeSessionProjectId(await api.getSessionValue(ACTIVE_PROJECT_SESSION_KEY));
  const activeProject =
    (sessionProjectId ? projects.find((project) => project.id === sessionProjectId) : null) ?? projects[0] ?? null;

  if (activeProject && activeProject.id !== sessionProjectId) {
    await api.setSessionValue(ACTIVE_PROJECT_SESSION_KEY, activeProject.id);
  }

  if (!activeProject && sessionProjectId) {
    await api.unsetSessionValue(ACTIVE_PROJECT_SESSION_KEY);
  }

  // Fetch full project details for credential status
  let fullProject: ProjectResponse | null = null;
  let guideContent: string | null = null;

  if (activeProject) {
    const projectResponse = await api.fetch(`/projects/${encodeURIComponent(activeProject.id)}`);
    if (projectResponse.ok) {
      fullProject = (await projectResponse.json()) as ProjectResponse;
    }
  }

  // Fetch guide content
  const guideResponse = await api.fetch("/guide/donkey-client.md");
  if (guideResponse.ok) {
    guideContent = await guideResponse.text();
  }

  return data(
    {
      projects,
      activeProject,
      fullProject,
      guideContent,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export async function action({ request }: { request: Request }) {
  const api = new ApiClient(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) {
    return data(
      {
        error: "Select a project first.",
      } satisfies ActionData,
      {
        status: 400,
        headers: await api.commit(),
      }
    );
  }

  // Handle generate_api_key intent
  if (intent === "generate_api_key") {
    let response: Response;

    try {
      response = await api.fetch(`/projects/${encodeURIComponent(projectId)}/api-key`, {
        method: "POST",
      });
    } catch {
      return data(
        {
          error: "Unable to contact the API right now. Please try again.",
        } satisfies ActionData,
        {
          status: 502,
          headers: await api.commit(),
        }
      );
    }

    if (response.status === 401) {
      return redirect("/login", {
        headers: {
          "Set-Cookie": await api.logout(),
        },
      });
    }

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

  // Handle generate_webhook_secret intent
  if (intent === "generate_webhook_secret") {
    let response: Response;

    try {
      response = await api.fetch(`/projects/${encodeURIComponent(projectId)}/webhook-secret`, {
        method: "POST",
      });
    } catch {
      return data(
        {
          error: "Unable to contact the API right now. Please try again.",
        } satisfies ActionData,
        {
          status: 502,
          headers: await api.commit(),
        }
      );
    }

    if (response.status === 401) {
      return redirect("/login", {
        headers: {
          "Set-Cookie": await api.logout(),
        },
      });
    }

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

  // Handle save_webhook_url intent
  if (intent === "save_webhook_url") {
    const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();

    // Validate HTTPS URL
    if (webhookUrl && !webhookUrl.startsWith("https://")) {
      return data(
        {
          error: "Webhook URL must start with https://",
        } satisfies ActionData,
        {
          status: 400,
          headers: await api.commit(),
        }
      );
    }

    let response: Response;

    try {
      response = await api.fetch(`/projects/${encodeURIComponent(projectId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settings: {
            notification_webhook: webhookUrl || null,
            auto_continue_on_error: false,
          },
        } satisfies ProjectUpdate),
      });
    } catch {
      return data(
        {
          error: "Unable to contact the API right now. Please try again.",
        } satisfies ActionData,
        {
          status: 502,
          headers: await api.commit(),
        }
      );
    }

    if (response.status === 401) {
      return redirect("/login", {
        headers: {
          "Set-Cookie": await api.logout(),
        },
      });
    }

    if (!response.ok) {
      const apiMessage = await readApiErrorMessage(response);
      return data(
        {
          error: apiMessage ?? "Unable to save webhook URL right now.",
        } satisfies ActionData,
        {
          status: response.status,
          headers: await api.commit(),
        }
      );
    }

    return data(
      {
        webhookSaved: true,
        success: "Webhook URL saved successfully.",
      } satisfies ActionData,
      {
        headers: await api.commit(),
      }
    );
  }

  return data(
    {
      error: "Unsupported action.",
    } satisfies ActionData,
    {
      status: 400,
      headers: await api.commit(),
    }
  );
}

export default function DashboardSettingsRoute() {
  const { projects, activeProject, fullProject, guideContent } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const onboardingTab = parseOnboardingTab(searchParams.get("onboardingTab"));

  const [activeTab, setActiveTab] = useState<SettingsTab>(onboardingTab ?? "overview");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [webhookCopyState, setWebhookCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [guideCopyState, setGuideCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [guideExpanded, setGuideExpanded] = useState(false);

  // Type assertion for settings - ProjectResponse schema doesn't include settings in types but API returns it
  const projectSettings = (fullProject as any)?.settings as components["schemas"]["ProjectSettings"] | undefined;
  const [webhookUrl, setWebhookUrl] = useState(projectSettings?.notification_webhook ?? "");

  const generatedKey = actionData?.generatedKey ?? null;
  const generatedWebhookSecret = actionData?.generatedWebhookSecret ?? null;
  const isGenerating =
    navigation.state === "submitting" && navigation.formData?.get("intent")?.toString() === "generate_api_key";
  const isGeneratingWebhook =
    navigation.state === "submitting" && navigation.formData?.get("intent")?.toString() === "generate_webhook_secret";
  const isSavingWebhook =
    navigation.state === "submitting" && navigation.formData?.get("intent")?.toString() === "save_webhook_url";
  const hasProjects = projects.length > 0;

  const hasWebhook = !!projectSettings?.notification_webhook;

  useEffect(() => {
    setCopyState("idle");
  }, [generatedKey?.api_key]);

  useEffect(() => {
    setWebhookCopyState("idle");
  }, [generatedWebhookSecret?.notification_webhook_secret]);

  useEffect(() => {
    setWebhookUrl(projectSettings?.notification_webhook ?? "");
  }, [projectSettings?.notification_webhook]);

  useEffect(() => {
    if (!onboardingTab) return;
    setActiveTab(onboardingTab);
  }, [onboardingTab]);

  const handleCopyKey = async () => {
    if (!generatedKey?.api_key) return;
    try {
      await navigator.clipboard.writeText(generatedKey.api_key);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const handleCopyWebhookSecret = async () => {
    if (!generatedWebhookSecret?.notification_webhook_secret) return;
    try {
      await navigator.clipboard.writeText(generatedWebhookSecret.notification_webhook_secret);
      setWebhookCopyState("copied");
    } catch {
      setWebhookCopyState("error");
    }
  };

  const handleCopyGuide = async () => {
    if (!guideContent) return;
    try {
      await navigator.clipboard.writeText(guideContent);
      setGuideCopyState("copied");
      setTimeout(() => setGuideCopyState("idle"), 2000);
    } catch {
      setGuideCopyState("error");
    }
  };

  const integrationExampleProjectId = activeProject?.id ?? "<project_id>";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header Section */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="rounded-3xl border-2 border-black bg-gradient-to-r from-[#eef5ff] to-[#f4fbf8] p-6 shadow-[4px_4px_0_#1a1a1a]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">Project Credentials</Badge>
          <Badge variant={hasWebhook ? "success" : "muted"}>
            {hasWebhook ? "✓ Webhook" : "Webhook"}
          </Badge>
          {activeProject && <Badge variant="muted">Active: {activeProject.name}</Badge>}
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Manage your project integration credentials, webhook configuration, and access the AI agent integration guide.
        </p>
      </motion.section>

      {/* Error/Success Messages */}
      {actionData?.error && (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="pt-5 text-sm font-semibold text-rose-700">{actionData.error}</CardContent>
        </Card>
      )}
      {actionData?.success && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="pt-5 text-sm font-semibold text-emerald-700">{actionData.success}</CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs>
        <TabsList>
          <TabsTrigger active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
            📋 Overview
          </TabsTrigger>
          <TabsTrigger active={activeTab === "api-keys"} onClick={() => setActiveTab("api-keys")}>
            🔑 API Keys
          </TabsTrigger>
          <TabsTrigger active={activeTab === "webhooks"} onClick={() => setActiveTab("webhooks")}>
            🪝 Webhooks
          </TabsTrigger>
          <TabsTrigger active={activeTab === "ai-guide"} onClick={() => setActiveTab("ai-guide")}>
            🤖 AI Guide
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <TabsContent>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-slate-600" />
                      <CardTitle>API Key</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="mb-3">
                      Authenticate requests to integration endpoints with project-scoped API keys.
                    </CardDescription>
                    <Button variant="default" size="sm" onClick={() => setActiveTab("api-keys")}>
                      Manage API Key
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Webhook className="h-5 w-5 text-slate-600" />
                      <CardTitle>Webhooks</CardTitle>
                      {hasWebhook && <Badge variant="success">✓</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="mb-3">
                      Receive real-time notifications when pipeline events occur.
                    </CardDescription>
                    <Button
                      variant={hasWebhook ? "outline" : "default"}
                      size="sm"
                      onClick={() => setActiveTab("webhooks")}
                    >
                      {hasWebhook ? "View Configuration" : "Configure Webhook"}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-slate-600" />
                      <CardTitle>AI Agent Integration Guide</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="mb-3">
                      Get help building your Donkey SEO integration by sharing our guide with Claude, ChatGPT, or your
                      preferred AI assistant.
                    </CardDescription>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("ai-guide")}>
                      View Guide
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </TabsContent>
        )}

        {/* API Keys Tab */}
        {activeTab === "api-keys" && (
          <TabsContent>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Integration API key</CardTitle>
                    <CardDescription>
                      Generate a key for the currently active project. Generating a new key rotates the old key immediately.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      {activeProject ? (
                        <>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Active project</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{activeProject.name}</p>
                          <p className="text-xs text-slate-500">{activeProject.domain}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-slate-900">No active project found</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Create a project first, then come back here to generate a project-scoped API key.
                          </p>
                        </>
                      )}
                    </div>

                    <Form method="post" className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="intent" value="generate_api_key" />
                      <input type="hidden" name="projectId" value={activeProject?.id ?? ""} />
                      <Button type="submit" disabled={!activeProject || isGenerating}>
                        {isGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating key...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Generate new API key
                          </>
                        )}
                      </Button>

                      {hasProjects ? (
                        <p className="text-xs text-slate-500">Use the project switcher in the sidebar to target another project.</p>
                      ) : (
                        <Link to="/projects/new" className="inline-flex">
                          <Button type="button" variant="outline" size="sm">
                            Create project
                          </Button>
                        </Link>
                      )}
                    </Form>

                    {generatedKey && (
                      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-950">Copy this key now. It is only shown once.</p>
                        <p className="mt-1 text-xs text-amber-800">
                          Donkey SEO stores a secure hash, not the plaintext value. If you lose this key, generate a new one.
                        </p>

                        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5">
                          <p className="break-all font-mono text-xs text-slate-100">{generatedKey.api_key}</p>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="rounded-full border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-900">
                            Last4: {generatedKey.last4}
                          </span>
                          <span className="rounded-full border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-900">
                            Created: {formatDateTime(generatedKey.created_at)}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={handleCopyKey}>
                            {copyState === "copied" ? (
                              <>
                                <Check className="mr-1.5 h-4 w-4" />
                                Copied
                              </>
                            ) : (
                              "Copy API key"
                            )}
                          </Button>
                          {copyState === "error" && <p className="text-xs text-rose-700">Clipboard copy failed. Copy manually.</p>}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>What you can do with this key</CardTitle>
                    <CardDescription>Use your API key to access integration endpoints for fetching and publishing articles.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm leading-relaxed text-slate-700">
                    <div className="rounded-xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="text-lg">📦</span>
                        Integration Endpoints
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-600">
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-600">•</span>
                          <span>Fetch generated article content with HTML and metadata</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-600">•</span>
                          <span>Report publication status when articles go live</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-600">•</span>
                          <span>Access specific article versions for rollback or comparison</span>
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
                        <span className="text-lg">🔐</span>
                        Authentication
                      </h4>
                      <div className="space-y-2 text-xs text-blue-800">
                        <p>Include your API key in every request:</p>
                        <div className="rounded-lg bg-white p-2 font-mono text-xs text-slate-800">
                          <div>Header: <span className="text-blue-600">X-API-Key: dseo_...</span></div>
                          <div>Query: <span className="text-blue-600">?project_id={integrationExampleProjectId}</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-purple-900">
                        <span className="text-lg">🤖</span>
                        Need Help Building Your Integration?
                      </h4>
                      <p className="mb-3 text-xs text-purple-800">
                        Check the <strong>AI Guide</strong> tab for complete documentation, code examples, and endpoint reference you can share with Claude or ChatGPT.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab("ai-guide")}
                        className="border-purple-300 bg-white text-purple-900 hover:bg-purple-100"
                      >
                        <Bot className="mr-2 h-4 w-4" />
                        View AI Guide
                      </Button>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p className="font-semibold text-slate-900">Security Notes</p>
                      <ul className="mt-2 space-y-1">
                        <li>• Keys are project-scoped and start with <code className="rounded bg-white px-1 py-0.5 font-mono">dseo_</code></li>
                        <li>• Only the hash is stored - the plaintext key is shown once</li>
                        <li>• Generating a new key immediately invalidates the old one</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </TabsContent>
        )}

        {/* Webhooks Tab */}
        {activeTab === "webhooks" && (
          <TabsContent>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Webhook Configuration</CardTitle>
                    <CardDescription>
                      Generate a signing secret and configure your webhook endpoint to receive real-time notifications.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      {activeProject ? (
                        <>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Active project</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{activeProject.name}</p>
                          <p className="text-xs text-slate-500">{activeProject.domain}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-slate-900">No active project found</p>
                          <p className="mt-1 text-xs text-slate-500">Create a project first.</p>
                        </>
                      )}
                    </div>

                    {/* Generate Webhook Secret */}
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-900">Step 1: Generate Webhook Secret</h3>
                      <Form method="post" className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="intent" value="generate_webhook_secret" />
                        <input type="hidden" name="projectId" value={activeProject?.id ?? ""} />
                        <Button type="submit" disabled={!activeProject || isGeneratingWebhook}>
                          {isGeneratingWebhook ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Generating secret...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Generate Webhook Secret
                            </>
                          )}
                        </Button>
                      </Form>

                      {generatedWebhookSecret && (
                        <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                          <p className="text-sm font-semibold text-amber-950">Copy this secret now. It is only shown once.</p>
                          <p className="mt-1 text-xs text-amber-800">
                            Store this secret securely. You'll use it to verify webhook signatures.
                          </p>

                          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5">
                            <p className="break-all font-mono text-xs text-slate-100">
                              {generatedWebhookSecret.notification_webhook_secret}
                            </p>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="rounded-full border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-900">
                              Updated: {formatDateTime(generatedWebhookSecret.updated_at)}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={handleCopyWebhookSecret}>
                              {webhookCopyState === "copied" ? (
                                <>
                                  <Check className="mr-1.5 h-4 w-4" />
                                  Copied
                                </>
                              ) : (
                                "Copy Secret"
                              )}
                            </Button>
                            {webhookCopyState === "error" && (
                              <p className="text-xs text-rose-700">Clipboard copy failed. Copy manually.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Configure Webhook URL */}
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-900">Step 2: Configure Webhook URL</h3>
                      <Form method="post" className="space-y-3">
                        <input type="hidden" name="intent" value="save_webhook_url" />
                        <input type="hidden" name="projectId" value={activeProject?.id ?? ""} />
                        <div>
                          <label htmlFor="webhookUrl" className="mb-1.5 block text-xs font-medium text-slate-700">
                            Webhook Endpoint URL
                          </label>
                          <input
                            id="webhookUrl"
                            name="webhookUrl"
                            type="url"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            placeholder="https://your-app.com/api/webhooks/donkey"
                            className={cn(
                              "w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm",
                              "placeholder:text-slate-400",
                              "focus:border-black focus:outline-none focus:ring-0"
                            )}
                          />
                          <p className="mt-1.5 text-xs text-slate-500">Must be a valid HTTPS URL.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="submit" disabled={!activeProject || isSavingWebhook || !webhookUrl}>
                            {isSavingWebhook ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save Webhook URL"
                            )}
                          </Button>
                          {hasWebhook && (
                            <Badge variant="success" className="text-xs">
                              ✓ Configured
                            </Badge>
                          )}
                        </div>
                      </Form>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>How Webhooks Work</CardTitle>
                    <CardDescription>Real-time notifications for your project events.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm leading-relaxed text-slate-700">
                    <div className="rounded-xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="text-lg">⚡</span>
                        Setup Steps
                      </h4>
                      <ol className="space-y-2 text-xs text-slate-600">
                        <li className="flex gap-2">
                          <span className="font-semibold text-slate-900">1.</span>
                          <span>Generate a webhook secret (used to sign requests)</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold text-slate-900">2.</span>
                          <span>Set your HTTPS endpoint URL</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold text-slate-900">3.</span>
                          <span>Verify signatures using HMAC-SHA256</span>
                        </li>
                      </ol>
                    </div>

                    <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-purple-900">
                        <span className="text-lg">📬</span>
                        Event Types
                      </h4>
                      <ul className="space-y-1 text-xs text-purple-800">
                        <li className="flex items-start gap-2">
                          <span>•</span>
                          <span>Pipeline runs completed</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span>•</span>
                          <span>Content briefs created</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span>•</span>
                          <span>Articles generated</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span>•</span>
                          <span>Articles published</span>
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
                        <span className="text-lg">🔒</span>
                        Signature Verification
                      </h4>
                      <p className="mb-2 text-xs text-blue-800">
                        All webhook requests include an <code className="rounded bg-white px-1 py-0.5 font-mono text-blue-900">X-Webhook-Signature</code> header with an HMAC-SHA256 signature.
                      </p>
                      <pre className="overflow-x-auto rounded-lg border border-blue-300 bg-white p-2 text-[11px] text-slate-800">
                        <code>{`// Verify webhook signature (Node.js)
const crypto = require('crypto');
const hmac = crypto
  .createHmac('sha256', webhookSecret)
  .update(requestBody)
  .digest('hex');
const isValid = hmac === signatureHeader;`}</code>
                      </pre>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p>
                        💡 <span className="font-semibold text-slate-900">Need complete examples?</span> The AI Guide tab includes full webhook receiver implementations for Node.js, Python, and serverless platforms.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </TabsContent>
        )}

        {/* AI Guide Tab */}
        {activeTab === "ai-guide" && (
          <TabsContent>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl"
            >
              <Card data-onboarding-focus="settings-ai-guide-card">
                <CardHeader>
                  <CardTitle>Build Integrations with AI Agents</CardTitle>
                  <CardDescription>
                    Install the DonkeySEO client in your coding agent by copying this guide. It includes the API docs,
                    authentication details, and example code needed to set up your integration.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Button
                      data-onboarding-focus="settings-ai-guide-copy"
                      onClick={handleCopyGuide}
                      disabled={!guideContent}
                    >
                      {guideCopyState === "copied" ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Copied to Clipboard!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Integration Guide
                        </>
                      )}
                    </Button>
                    {guideCopyState === "error" && <p className="text-xs text-rose-700">Copy failed. Try again.</p>}
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    <p className="font-semibold">How to use this guide:</p>
                    <ol className="mt-2 space-y-1 text-xs">
                      <li>1. Click "Copy Integration Guide" above</li>
                      <li>2. Open your coding agent (Claude Code, ChatGPT, or similar)</li>
                      <li>3. Paste the copied agent code and setup instructions</li>
                      <li>
                        4. Ask it to install or generate the DonkeySEO integration you need
                      </li>
                    </ol>
                  </div>

                  {/* Guide Preview */}
                  {guideContent && (
                    <div>
                      <button
                        onClick={() => setGuideExpanded(!guideExpanded)}
                        className="flex w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-100"
                      >
                        <span>Preview Guide Content</span>
                        {guideExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      {guideExpanded && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                          <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-700">
                            {guideContent}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
