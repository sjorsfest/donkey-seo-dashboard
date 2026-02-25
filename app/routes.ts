import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  layout("routes/_auth.tsx", [
    route("login", "routes/_auth.login.tsx"),
    route("register", "routes/_auth.register.tsx"),
    route("auth/callback", "routes/auth.callback.tsx"),
  ]),
  layout("routes/_dashboard.tsx", [
    route("billing", "routes/_dashboard.billing.tsx"),
    route("settings", "routes/_dashboard.settings.tsx"),
    route("project", "routes/_dashboard.project.tsx"),
    route("projects/new", "routes/_dashboard.projects.new.tsx"),
    route("projects/setup-task/:taskId", "routes/_dashboard.projects.setup-task.$taskId.tsx"),
    route(
      "projects/:projectId/progress/:runId",
      "routes/_dashboard.projects.$projectId.progress.$runId.tsx"
    ),
    route(
      "projects/:projectId/brand-visual-context",
      "routes/_dashboard.projects.$projectId.brand-visual-context.tsx"
    ),
    route(
      "projects/:projectId/keyword-detail/:keywordId",
      "routes/_dashboard.projects.$projectId.keyword-detail.$keywordId.tsx"
    ),
    route("projects/:projectId/discovery", "routes/_dashboard.projects.$projectId.discovery.tsx"),
    route("projects/:projectId/calendar", "routes/_dashboard.projects.$projectId.calendar.tsx"),
    route(
      "projects/:projectId/discovery/keywords",
      "routes/_dashboard.projects.$projectId.discovery.keywords.tsx"
    ),
    route(
      "projects/:projectId/discovery/topics",
      "routes/_dashboard.projects.$projectId.discovery.topics.tsx"
    ),
    route(
      "projects/:projectId/discovery/runs/:runId",
      "routes/_dashboard.projects.$projectId.discovery.runs.$runId.tsx"
    ),
    route(
      "projects/:projectId/discovery/runs/:runId/steps/:stepNumber",
      "routes/_dashboard.projects.$projectId.discovery.runs.$runId.steps.$stepNumber.tsx"
    ),
    route("projects/:projectId/creation", "routes/_dashboard.projects.$projectId.creation.tsx"),
    route(
      "projects/:projectId/creation/runs/:runId",
      "routes/_dashboard.projects.$projectId.creation.runs.$runId.tsx"
    ),
    route(
      "projects/:projectId/creation/runs/:runId/briefs/:briefId",
      "routes/_dashboard.projects.$projectId.creation.runs.$runId.briefs.$briefId.tsx"
    ),
    route("projects/:projectId", "routes/_dashboard.projects.$projectId.tsx"),
    route("projects", "routes/_dashboard.projects._index.tsx"),
  ]),
  route("logout", "routes/_auth.logout.tsx"),
] satisfies RouteConfig;
