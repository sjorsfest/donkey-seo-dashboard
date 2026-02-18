import { data, redirect } from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId.keyword-detail.$keywordId";
import { ApiClient } from "~/lib/api.server";
import type { components } from "~/types/api.generated";

type KeywordDetailResponse = components["schemas"]["KeywordDetailResponse"];

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  const keywordId = params.keywordId;

  if (!projectId || !keywordId) {
    throw new Response("Missing route parameters.", { status: 400 });
  }

  const api = new ApiClient(request);
  const response = await api.fetch(`/keywords/${projectId}/${keywordId}`);

  if (response.status === 401) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  if (!response.ok) {
    throw new Response("Unable to fetch keyword detail.", { status: response.status });
  }

  const payload = (await response.json()) as KeywordDetailResponse;

  return data(payload, {
    headers: await api.commit(),
  });
}

export default function ProjectKeywordDetailDataRoute() {
  return null;
}
