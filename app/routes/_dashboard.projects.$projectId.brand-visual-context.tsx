import { data, redirect } from "react-router";
import type { Route } from "./+types/_dashboard.projects.$projectId.brand-visual-context";
import { ApiClient } from "~/lib/api.server";
import type { components } from "~/types/api.generated";

type BrandVisualContextResponse = components["schemas"]["BrandVisualContextResponse"];

type LoaderData = {
  brand: BrandVisualContextResponse | null;
  error?: string;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  const api = new ApiClient(request);

  if (!projectId) {
    return data({ brand: null, error: "Missing project id." } satisfies LoaderData, {
      status: 400,
      headers: await api.commit(),
    });
  }

  const response = await api.fetch(`/brand/${projectId}/visual-context`);

  if (response.status === 401) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  if (!response.ok) {
    return data(
      {
        brand: null,
      } satisfies LoaderData,
      {
        headers: await api.commit(),
      }
    );
  }

  const brand = (await response.json()) as BrandVisualContextResponse;

  return data(
    {
      brand,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export default function ProjectBrandVisualContextDataRoute() {
  return null;
}
