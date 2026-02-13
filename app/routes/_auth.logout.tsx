import { redirect } from "react-router";
import type { Route } from "./+types/_auth.logout";
import { destroySession, getSession } from "~/lib/session.server";

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

export default function Logout() {
  return null;
}
