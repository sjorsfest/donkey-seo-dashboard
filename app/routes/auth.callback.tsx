import { Link, data, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/auth.callback";
import { commitSession, getSession } from "~/lib/session.server";

const SOCIAL_PROVIDERS = new Set(["google", "twitter"]);

function parseErrorMessage(searchParams: URLSearchParams) {
  const message =
    searchParams.get("error_description") ??
    searchParams.get("detail") ??
    searchParams.get("message") ??
    searchParams.get("error");

  if (!message) return null;
  if (message === "access_denied") return "Access was denied. Please try again.";
  return message;
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const existingAccessToken = session.get("accessToken") as string | undefined;
  if (existingAccessToken) {
    return redirect("/projects");
  }

  const currentUrl = new URL(request.url);
  const provider = currentUrl.searchParams.get("provider");
  if (provider && !SOCIAL_PROVIDERS.has(provider)) {
    return data({ error: "Unsupported social login provider." }, { status: 400 });
  }

  const accessToken = currentUrl.searchParams.get("access_token");
  const refreshToken = currentUrl.searchParams.get("refresh_token");

  if (accessToken && refreshToken) {
    session.set("accessToken", accessToken);
    session.set("refreshToken", refreshToken);

    return redirect("/projects", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  }

  const error = parseErrorMessage(currentUrl.searchParams);
  if (error) {
    return data({ error }, { status: 400 });
  }

  return redirect("/login");
}

export default function AuthCallback() {
  const { error } = useLoaderData<typeof loader>();

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white p-8 rounded-3xl border-2 border-black text-center" style={{ boxShadow: "4px 4px 0px 0px #1a1a1a" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 overflow-hidden bg-white border-2 border-black">
          <img src="/static/donkey.png" alt="DonkeySEO" className="w-12 h-12 object-contain" />
        </div>
        <h2 className="font-display text-3xl font-bold text-slate-900 mb-2">
          Social login failed
        </h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <Link
          to="/login"
          className="inline-flex items-center justify-center h-11 px-6 text-sm font-bold rounded-xl shadow-lg shadow-secondary/20 transition-all duration-200 bg-secondary text-white hover:scale-[1.02] active:scale-[0.98]"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
