import { redirect } from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId";

export async function loader({ params }: Route.LoaderArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw new Response("Missing project id.", { status: 400 });
  }

  return redirect(`/projects/${projectId}/discovery`);
}

export default function ProjectPhaseRedirectRoute() {
  return null;
}
