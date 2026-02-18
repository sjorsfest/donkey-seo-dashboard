import { motion } from "framer-motion";
import { Link, data, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/_dashboard.projects._index";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { ApiClient } from "~/lib/api.server";
import {
  formatDateTime,
  formatStatusLabel,
  getStatusBadgeClass,
  summarizeSteps,
} from "~/lib/dashboard";
import type { components } from "~/types/api.generated";

type ProjectListResponse = components["schemas"]["ProjectListResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];

type LoaderData = {
  projects: ProjectResponse[];
  latestRunsByProject: Record<string, PipelineRunResponse | null>;
};

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

  const projectsPayload = (await response.json()) as ProjectListResponse;
  const projects = (projectsPayload.items ?? []) as ProjectResponse[];

  const runResults = await Promise.all(
    projects.map(async (project) => {
      const runsResponse = await api.fetch(`/pipeline/${project.id}/runs?limit=1`);

      if (runsResponse.status === 401) {
        return { unauthorized: true, projectId: project.id, run: null as PipelineRunResponse | null };
      }

      if (!runsResponse.ok) {
        return { unauthorized: false, projectId: project.id, run: null as PipelineRunResponse | null };
      }

      const runs = (await runsResponse.json()) as PipelineRunResponse[];
      return { unauthorized: false, projectId: project.id, run: runs[0] ?? null };
    })
  );

  if (runResults.some((result) => result.unauthorized)) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  const latestRunsByProject: Record<string, PipelineRunResponse | null> = {};
  for (const result of runResults) {
    latestRunsByProject[result.projectId] = result.run;
  }

  return data(
    {
      projects,
      latestRunsByProject,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export default function ProjectsOverviewRoute() {
  const { projects, latestRunsByProject } = useLoaderData<typeof loader>() as LoaderData;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0f6f5] to-[#eef1f8] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Dashboard</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Pipeline Portfolio</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Track every project at a glance, then jump into a control room to inspect and steer the pipeline.
            </p>
          </div>
          <Link to="/projects/new" className="inline-flex">
            <Button size="lg" className="shadow-lg shadow-[#2f6f71]/20">
              New project
            </Button>
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-slate-900">Your projects</h2>
          <Badge variant="info">{projects.length} total</Badge>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed bg-white/80">
            <CardHeader>
              <CardTitle>No projects yet</CardTitle>
              <CardDescription>
                Start with a guided wizard and launch your first SEO pipeline in minutes.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Link to="/projects/new" className="inline-flex">
                <Button>Create your first project</Button>
              </Link>
            </CardFooter>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, index) => {
              const latestRun = latestRunsByProject[project.id];
              const stepSummary = latestRun ? summarizeSteps(latestRun.step_executions ?? []) : null;

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: index * 0.04 }}
                >
                  <Card className="h-full border-slate-200 bg-white">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle>{project.name}</CardTitle>
                          <CardDescription>{project.domain}</CardDescription>
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(project.status)}`}
                        >
                          {formatStatusLabel(project.status)}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                        <div>
                          <p className="font-semibold text-slate-800">Current step</p>
                          <p>#{project.current_step}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">Updated</p>
                          <p>{formatDateTime(project.updated_at)}</p>
                        </div>
                      </div>

                      {!latestRun ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
                          No run history yet.
                        </div>
                      ) : (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <p className="font-semibold text-slate-800">Latest run</p>
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 font-semibold ${getStatusBadgeClass(latestRun.status)}`}
                            >
                              {formatStatusLabel(latestRun.status)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Started {formatDateTime(latestRun.started_at ?? latestRun.created_at)}
                          </p>
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-900">
                              Done: {stepSummary?.succeeded ?? 0}
                            </span>
                            <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900">
                              Active: {stepSummary?.active ?? 0}
                            </span>
                            <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-900">
                              Failed: {stepSummary?.failed ?? 0}
                            </span>
                          </div>
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="flex justify-end gap-2">
                      <Link to={`/projects/${project.id}/discovery`} className="inline-flex">
                        <Button variant="outline">Open discovery</Button>
                      </Link>
                      <Link to={`/projects/${project.id}/creation`} className="inline-flex">
                        <Button variant="outline">Open creation</Button>
                      </Link>
                    </CardFooter>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {projects.length > 0 ? null : (
        <section className="grid gap-2 md:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </section>
      )}
    </div>
  );
}
