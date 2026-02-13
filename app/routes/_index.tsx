import { redirect } from "react-router";
import type { Route } from "./+types/_index";
import { getSession } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const accessToken = session.get("accessToken") as string | undefined;
  return redirect(accessToken ? "/projects" : "/login");
}

export default function Index() {
  return null;
}
