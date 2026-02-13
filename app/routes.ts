import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  layout("routes/_auth.tsx", [
    route("login", "routes/_auth.login.tsx"),
    route("register", "routes/_auth.register.tsx"),
  ]),
  layout("routes/_dashboard.tsx", [
    route("projects", "routes/_dashboard.projects._index.tsx"),
  ]),
  route("logout", "routes/_auth.logout.tsx"),
] satisfies RouteConfig;
