import { Form, Outlet, data, useLoaderData } from "react-router";
import type { Route } from "./+types/_dashboard";
import type { components } from "~/types/api.generated";
import { ApiClient } from "~/lib/api.server";

type UserResponse = components["schemas"]["UserResponse"];

export async function loader({ request }: Route.LoaderArgs) {
  const api = new ApiClient(request);
  const user = await api.requireUser();
  return data(
    { user },
    {
      headers: await api.commit(),
    }
  );
}

export default function DashboardLayout() {
  const { user } = useLoaderData<typeof loader>() as { user: UserResponse };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border-2 border-black bg-white flex items-center justify-center">
              <img src="/static/donkey.png" alt="DonkeySEO" className="w-7 h-7" />
            </div>
            <div>
              <p className="font-display text-xl font-bold">DonkeySEO</p>
              <p className="text-xs text-slate-500">Pipeline Control Room</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">{user.full_name ?? user.email}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="h-9 px-4 rounded-full border-2 border-black text-sm font-bold bg-white hover:bg-black hover:text-white transition-colors"
              >
                Log out
              </button>
            </Form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
