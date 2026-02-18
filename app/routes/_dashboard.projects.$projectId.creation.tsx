import { Form, Link, data, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId.creation";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ApiClient } from "~/lib/api.server";
import { formatDateTime, formatStatusLabel, getStatusBadgeClass } from "~/lib/dashboard";
import { classifyPipelineRuns, fetchJson } from "~/lib/pipeline-run.server";
import { pickLatestRunForPhase, type ClassifiedPipelineRun } from "~/lib/pipeline-phase";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];

type LoaderData = {
  project: ProjectResponse;
  runs: ClassifiedPipelineRun[];
};

type ActionData = {
  error?: string;
};

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

async function handleUnauthorized(api: ApiClient) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  if (!projectId) {
    throw new Response("Missing project id.", { status: 400 });
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

  const preferred = pickLatestRunForPhase(classified.runs, "creation");
  if (preferred) {
    return redirect(`/projects/${projectId}/creation/runs/${preferred.run.id}`, {
      headers: await api.commit(),
    });
  }

  return data(
    {
      project: projectResult.data,
      runs: classified.runs,
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

  const api = new ApiClient(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "startCreation") {
    return data({ error: "Unsupported action." } satisfies ActionData, { status: 400 });
  }

  const payload: PipelineStartRequest = {
    mode: "content_production",
    start_step: 0,
    content: {
      max_briefs: 20,
      posts_per_week: 1,
      min_lead_days: 7,
      use_llm_timing_hints: true,
      llm_timing_flex_days: 14,
    },
  };

  const startResponse = await api.fetch(`/pipeline/${projectId}/start`, {
    method: "POST",
    json: payload,
  });

  if (startResponse.status === 401) return handleUnauthorized(api);

  if (!startResponse.ok) {
    return data(
      { error: "Unable to start creation run." } satisfies ActionData,
      { status: startResponse.status, headers: await api.commit() }
    );
  }

  const run = (await startResponse.json()) as PipelineRunResponse;
  return redirect(`/projects/${projectId}/creation/runs/${run.id}`, {
    headers: await api.commit(),
  });
}

export default function ProjectCreationLandingRoute() {
  const { project, runs } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f4f5fb] to-[#eef4ff] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4b5e9f]">Content creation</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              No creation run is available yet. Start content production to generate briefs and writer instructions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/projects/${project.id}/discovery`}>
              <Button variant="outline">Go to discovery</Button>
            </Link>
            <Link to="/projects">
              <Button variant="outline">Back to projects</Button>
            </Link>
          </div>
        </div>
      </section>

      {actionData?.error ? (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {actionData.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Start creation</CardTitle>
          <CardDescription>Run the straight content pipeline to produce briefs and writing guidance.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post">
            <input type="hidden" name="intent" value="startCreation" />
            <Button type="submit">Start creation pipeline</Button>
          </Form>
        </CardContent>
      </Card>

      {runs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>Existing runs were classified by heuristics but none matched creation as default.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs.map((entry) => (
              <Link
                key={entry.run.id}
                to={`/projects/${project.id}/creation/runs/${entry.run.id}`}
                className="block rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-slate-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
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
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
