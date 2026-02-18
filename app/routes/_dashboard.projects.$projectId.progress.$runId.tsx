import { data, redirect } from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId.progress.$runId";
import { ApiClient } from "~/lib/api.server";
import type { components } from "~/types/api.generated";

type PipelineProgressResponse = components["schemas"]["PipelineProgressResponse"];

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  const runId = params.runId;

  if (!projectId || !runId) {
    throw new Response("Missing route parameters.", { status: 400 });
  }

  const api = new ApiClient(request);
  const response = await api.fetch(`/pipeline/${projectId}/runs/${runId}/progress`);

  if (response.status === 401) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  if (!response.ok) {
    throw new Response("Unable to fetch pipeline progress.", { status: response.status });
  }

  const progress = (await response.json()) as PipelineProgressResponse;

  return data(progress, {
    headers: await api.commit(),
  });
}

export default function ProjectProgressDataRoute() {
  return null;
}
