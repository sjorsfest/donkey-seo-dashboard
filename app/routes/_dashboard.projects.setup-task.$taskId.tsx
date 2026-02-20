import { data, redirect } from "react-router";
import type { Route } from "./+types/_dashboard.projects.setup-task.$taskId";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import type { components } from "~/types/api.generated";

type TaskStatusResponse = components["schemas"]["TaskStatusResponse"];

type LoaderData = {
  task: TaskStatusResponse | null;
  error?: string;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const taskId = params.taskId;
  const api = new ApiClient(request);

  if (!taskId) {
    return data({ task: null, error: "Missing task id." } satisfies LoaderData, {
      status: 400,
      headers: await api.commit(),
    });
  }

  const response = await api.fetch(`/tasks/${taskId}`);

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
        task: null,
        error: apiMessage ?? "Unable to fetch setup task status.",
      } satisfies LoaderData,
      {
        status: response.status,
        headers: await api.commit(),
      }
    );
  }

  const task = (await response.json()) as TaskStatusResponse;

  return data(
    {
      task,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export default function ProjectSetupTaskDataRoute() {
  return null;
}
