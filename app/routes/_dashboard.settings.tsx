import { useEffect, useState } from "react";
import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { motion } from "framer-motion";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import { formatDateTime } from "~/lib/dashboard";
import type { components } from "~/types/api.generated";

type ProjectListResponse = components["schemas"]["ProjectListResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type ProjectApiKeyResponse = components["schemas"]["ProjectApiKeyResponse"];

type ProjectSummary = Pick<ProjectResponse, "id" | "name" | "domain" | "status">;

type LoaderData = {
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
};

type ActionData = {
  error?: string;
  generatedKey?: ProjectApiKeyResponse;
};

const ACTIVE_PROJECT_SESSION_KEY = "activeProjectId";

function normalizeSessionProjectId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

  return data(
    {
      projects,
      activeProject,
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

  if (intent !== "generate_api_key") {
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

  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) {
    return data(
      {
        error: "Select a project before generating an API key.",
      } satisfies ActionData,
      {
        status: 400,
        headers: await api.commit(),
      }
    );
  }

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

export default function DashboardSettingsRoute() {
  const { projects, activeProject } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const generatedKey = actionData?.generatedKey ?? null;
  const isGenerating =
    navigation.state === "submitting" && navigation.formData?.get("intent")?.toString() === "generate_api_key";
  const hasProjects = projects.length > 0;

  useEffect(() => {
    setCopyState("idle");
  }, [generatedKey?.api_key]);

  const handleCopyKey = async () => {
    if (!generatedKey?.api_key) return;

    try {
      await navigator.clipboard.writeText(generatedKey.api_key);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const integrationExampleProjectId = activeProject?.id ?? "<project_id>";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="rounded-3xl border-2 border-black bg-gradient-to-r from-[#eef5ff] to-[#f4fbf8] p-6 shadow-[4px_4px_0_#1a1a1a]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">Project credentials</Badge>
          {activeProject ? <Badge variant="muted">Active: {activeProject.name}</Badge> : null}
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Create and rotate your project integration API key here. The key is used to authenticate calls to
          integration endpoints for one specific project.
        </p>
      </motion.section>

      {actionData?.error ? (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="pt-5 text-sm font-semibold text-rose-700">{actionData.error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
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

              {generatedKey ? (
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
                    {copyState === "error" ? <p className="text-xs text-rose-700">Clipboard copy failed. Copy manually.</p> : null}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>How these API keys work</CardTitle>
              <CardDescription>This is the exact behavior behind the integration key generated above.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed text-slate-700">
              <ol className="space-y-2">
                <li>
                  <span className="font-semibold text-slate-900">1. Project-scoped credential:</span> each key belongs to one
                  project only and starts with a <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">dseo_</code>
                  prefix.
                </li>
                <li>
                  <span className="font-semibold text-slate-900">2. Request auth:</span> integrators send the key in
                  <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">X-API-Key</code>
                  and include
                  <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">project_id</code>
                  as a query parameter.
                </li>
                <li>
                  <span className="font-semibold text-slate-900">3. Secure validation:</span> backend recomputes
                  HMAC-SHA256(api_key, INTEGRATION_API_KEY_PEPPER) and compares it to the stored hash for that project.
                </li>
                <li>
                  <span className="font-semibold text-slate-900">4. No plaintext storage:</span> only hash + metadata
                  (like last4 and created time) are persisted.
                </li>
                <li>
                  <span className="font-semibold text-slate-900">5. Rotation:</span> generating another key invalidates the
                  previous one immediately.
                </li>
              </ol>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Integration example</p>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800">
                  <code>{`curl "https://<host>/api/integration/article/<article_id>?project_id=${integrationExampleProjectId}" \\
  -H "X-API-Key: <dseo_...>"`}</code>
                </pre>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                <p className="font-semibold">Ops note</p>
                <p className="mt-1">
                  If your team rotates
                  <code className="mx-1 rounded bg-sky-100 px-1 py-0.5 font-mono">INTEGRATION_API_KEY_PEPPER</code>,
                  all project API keys must be regenerated.
                </p>
              </div>

              <p className="text-xs text-slate-500">Next up: webhook secret management can be added here as a second credential panel.</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
