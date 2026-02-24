import { redirect } from "react-router";
import type { Route } from "./+types/_dashboard.projects._index";

export async function loader(_: Route.LoaderArgs) {
  return redirect("/project");
}

export default function LegacyProjectsIndexRoute() {
  return null;
}
