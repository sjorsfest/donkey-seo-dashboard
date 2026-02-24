import { redirect } from "react-router";
import type { Route } from "./+types/_dashboard.project";
import { ApiClient } from "~/lib/api.server";
import type { components } from "~/types/api.generated";

type ProjectListResponse = components["schemas"]["ProjectListResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];

const ACTIVE_PROJECT_SESSION_KEY = "activeProjectId";

function normalizeSessionProjectId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const api = new ApiClient(request);
  await api.requireUser();

  const projectsResponse = await api.fetch("/projects/?page=1&page_size=100");
  if (!projectsResponse.ok) {
    throw new Response("Failed to load projects.", { status: projectsResponse.status });
  }

  const projectsPayload = (await projectsResponse.json()) as ProjectListResponse;
  const projects = (projectsPayload.items ?? []) as ProjectResponse[];
  const sessionProjectId = normalizeSessionProjectId(await api.getSessionValue(ACTIVE_PROJECT_SESSION_KEY));

  const activeProject =
    (sessionProjectId ? projects.find((project) => project.id === sessionProjectId) : null) ??
    projects[0] ??
    null;

  if (!activeProject) {
    await api.unsetSessionValue(ACTIVE_PROJECT_SESSION_KEY);
    return redirect("/projects/new", {
      headers: await api.commit(),
    });
  }

  if (sessionProjectId !== activeProject.id) {
    await api.setSessionValue(ACTIVE_PROJECT_SESSION_KEY, activeProject.id);
  }

  return redirect(`/projects/${activeProject.id}`, {
    headers: await api.commit(),
  });
}

export default function ProjectEntryRoute() {
  return null;
}
