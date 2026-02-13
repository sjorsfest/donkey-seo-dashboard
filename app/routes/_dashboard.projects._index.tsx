import { Form, data, redirect, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/_dashboard.projects._index";
import type { components } from "~/types/api.generated";
import { ApiClient } from "~/lib/api.server";

type ProjectCreate = components["schemas"]["ProjectCreate"];
type ProjectListResponse = components["schemas"]["ProjectListResponse"];
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];
type ProjectResponse = components["schemas"]["ProjectResponse"];

export async function loader({ request }: Route.LoaderArgs) {
  const api = new ApiClient(request);
  const response = await api.fetch("/projects/");

  if (response.status === 401) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  if (!response.ok) {
    throw new Response("Failed to load projects.", { status: response.status });
  }

  const projects = (await response.json()) as ProjectListResponse;
  return data(
    { projects },
    {
      headers: await api.commit(),
    }
  );
}

function parseOptionalInt(value: FormDataEntryValue | null) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSkipSteps(value: FormDataEntryValue | null) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  const numbers = trimmed
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  return numbers.length ? numbers : undefined;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "createProject") {
    const name = String(formData.get("name") ?? "").trim();
    const domain = String(formData.get("domain") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!name || !domain) {
      return data({ error: "Project name and domain are required." }, { status: 400 });
    }

    const payload: ProjectCreate = {
      name,
      domain,
      description: description || null,
    };

    const api = new ApiClient(request);
    const response = await api.fetch("/projects/", {
      method: "POST",
      json: payload,
    });

    if (!response.ok) {
      return data(
        { error: "Unable to create project." },
        { status: response.status, headers: await api.commit() }
      );
    }

    return redirect("/projects?created=1", {
      headers: await api.commit(),
    });
  }

  if (intent === "startPipeline") {
    const projectId = String(formData.get("project_id") ?? "").trim();

    if (!projectId) {
      return data({ error: "Missing project id." }, { status: 400 });
    }

    const payload: PipelineStartRequest = {
      start_step: parseOptionalInt(formData.get("start_step")),
      end_step: parseOptionalInt(formData.get("end_step")),
      skip_steps: parseSkipSteps(formData.get("skip_steps")),
    };

    const api = new ApiClient(request);
    const response = await api.fetch(
      `/pipeline/${projectId}/start`,
      {
        method: "POST",
        json: payload,
      }
    );

    if (!response.ok) {
      return data(
        { error: "Unable to start pipeline." },
        { status: response.status, headers: await api.commit() }
      );
    }

    return data(
      { success: "Pipeline started successfully.", projectId },
      { headers: await api.commit() }
    );
  }

  if (intent === "resumePipeline") {
    const projectId = String(formData.get("project_id") ?? "").trim();

    if (!projectId) {
      return data({ error: "Missing project id." }, { status: 400 });
    }

    const api = new ApiClient(request);
    const response = await api.fetch(`/pipeline/${projectId}/resume`, {
      method: "POST",
    });

    if (!response.ok) {
      return data(
        { error: "Unable to resume pipeline." },
        { status: response.status, headers: await api.commit() }
      );
    }

    return data(
      { success: "Pipeline resumed successfully.", projectId },
      { headers: await api.commit() }
    );
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function ProjectsDashboard() {
  const { projects } = useLoaderData<typeof loader>() as { projects: ProjectListResponse };
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  const isSubmitting = navigation.state === "submitting";
  const created = searchParams.get("created") === "1";
  const projectItems = (projects.items ?? []) as ProjectResponse[];

  return (
    <div className="space-y-8">
      <section className="bg-white border-2 border-black rounded-3xl p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">Create a project</h2>
            <p className="text-sm text-slate-500">Start a new keyword research workflow.</p>
          </div>
          {created && (
            <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
              Project created
            </div>
          )}
        </div>

        {actionData?.error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="mt-6 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="intent" value="createProject" />
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Project name</label>
            <input
              type="text"
              name="name"
              placeholder="Growth roadmap"
              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm"
              required
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Domain</label>
            <input
              type="text"
              name="domain"
              placeholder="example.com"
              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm"
              required
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <input
              type="text"
              name="description"
              placeholder="Optional notes"
              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 px-6 rounded-xl font-bold text-white bg-secondary shadow-lg shadow-secondary/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
            >
              {isSubmitting ? "Creating..." : "Create project"}
            </button>
          </div>
        </Form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">Your projects</h3>
            <p className="text-sm text-slate-500">Launch pipelines and track progress.</p>
          </div>
          {actionData?.success && (
            <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
              {actionData.success}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {projectItems.map((project) => (
            <div
              key={project.id}
              className="bg-white border-2 border-black/80 rounded-3xl p-5 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.7)] flex flex-col gap-4"
            >
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{project.status}</p>
                <h4 className="font-display text-xl font-bold text-slate-900">{project.name}</h4>
                <p className="text-sm text-slate-600">{project.domain}</p>
                <p className="text-xs text-slate-400 mt-1">Step {project.current_step}</p>
              </div>

              <Form method="post" className="grid gap-3">
                <input type="hidden" name="intent" value="startPipeline" />
                <input type="hidden" name="project_id" value={project.id} />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    name="start_step"
                    placeholder="Start"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-xs"
                  />
                  <input
                    type="number"
                    name="end_step"
                    placeholder="End"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-xs"
                  />
                  <input
                    type="text"
                    name="skip_steps"
                    placeholder="Skip (1,3)"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="h-10 rounded-xl font-bold text-sm bg-black text-white hover:bg-slate-900 transition-colors"
                >
                  Start pipeline
                </button>
              </Form>
              <Form method="post" className="grid">
                <input type="hidden" name="intent" value="resumePipeline" />
                <input type="hidden" name="project_id" value={project.id} />
                <button
                  type="submit"
                  className="h-9 rounded-xl font-bold text-sm border-2 border-black bg-white hover:bg-black hover:text-white transition-colors"
                >
                  Resume pipeline
                </button>
              </Form>
            </div>
          ))}
        </div>

        {projectItems.length === 0 && (
          <div className="mt-6 p-6 rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500 bg-white/60">
            No projects yet. Create one above to get started.
          </div>
        )}
      </section>
    </div>
  );
}
