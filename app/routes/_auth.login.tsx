import { Form, Link, data, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_auth.login";
import type { components } from "~/types/api.generated";
import { ApiClient } from "~/lib/api.server";
import { commitSession, getSession } from "~/lib/session.server";

type Token = components["schemas"]["Token"];
type SocialProvider = "google" | "twitter";

const SOCIAL_PROVIDERS = new Set<SocialProvider>(["google", "twitter"]);

function parseSocialProvider(value: string): SocialProvider | null {
  if (!SOCIAL_PROVIDERS.has(value as SocialProvider)) return null;
  return value as SocialProvider;
}

function getSocialLoginStartPath(provider: SocialProvider) {
  if (provider === "google") {
    return process.env.GOOGLE_OAUTH_START_PATH?.trim() || "/auth/oauth/google/start";
  }
  return process.env.TWITTER_OAUTH_START_PATH?.trim() || "/auth/oauth/twitter/start";
}

function buildSocialLoginStartUrl(request: Request, api: ApiClient, provider: SocialProvider) {
  const startPathOrUrl = getSocialLoginStartPath(provider);
  const startUrl = /^https?:\/\//i.test(startPathOrUrl)
    ? new URL(startPathOrUrl)
    : new URL(api.url(startPathOrUrl));

  const callbackUrl = new URL("/auth/callback", new URL(request.url).origin);
  callbackUrl.searchParams.set("provider", provider);
  startUrl.searchParams.set("redirect_uri", callbackUrl.toString());

  return startUrl.toString();
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const accessToken = session.get("accessToken") as string | undefined;
  if (accessToken) {
    return redirect("/projects");
  }
  return null;
}

function parseErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Invalid email or password.";
  const record = payload as Record<string, unknown>;
  const message = record.message ?? record.error ?? record.detail;
  return typeof message === "string" ? message : "Invalid email or password.";
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "").trim();

  if (intent.startsWith("oauth:")) {
    const provider = parseSocialProvider(intent.replace("oauth:", ""));
    if (!provider) {
      return data({ error: "Unsupported social login provider." }, { status: 400 });
    }

    const api = new ApiClient(request);
    return redirect(buildSocialLoginStartUrl(request, api, provider));
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!email || !password) {
    return data({ error: "Email and password are required." }, { status: 400 });
  }

  const api = new ApiClient(request);
  const response = await fetch(api.url("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    let message = "Invalid email or password.";
    try {
      message = parseErrorMessage(await response.clone().json());
    } catch {
      message = "Invalid email or password.";
    }
    return data({ error: message }, { status: response.status });
  }

  const tokens = (await response.json()) as Token;
  const session = await getSession(request.headers.get("Cookie"));
  session.set("accessToken", tokens.access_token);
  session.set("refreshToken", tokens.refresh_token);

  return redirect("/projects", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const activeIntent = String(navigation.formData?.get("intent") ?? "");
  const isLoading = navigation.state === "submitting" && activeIntent !== "oauth:google" && activeIntent !== "oauth:twitter";
  const isGoogleLoading = navigation.state === "submitting" && activeIntent === "oauth:google";
  const isTwitterLoading = navigation.state === "submitting" && activeIntent === "oauth:twitter";

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white p-8 rounded-3xl border-2 border-black" style={{ boxShadow: "4px 4px 0px 0px #1a1a1a" }}>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transform rotate-3 overflow-hidden bg-white border-2 border-black">
            <img src="/static/donkey.png" alt="DonkeySEO" className="w-12 h-12 object-contain" />
          </div>
          <h2 className="font-display text-3xl font-bold text-slate-900 mb-2">
            Welcome back!
          </h2>
          <p className="text-slate-500">Log in to launch your next pipeline.</p>
        </div>

        {actionData?.error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm font-medium">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="space-y-3">
          <button
            type="submit"
            name="intent"
            value="oauth:google"
            disabled={navigation.state === "submitting"}
            className="w-full h-11 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-70"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.1 3.5-8.7Z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1 7.9-2.9l-3.9-3a7.1 7.1 0 0 1-10.6-3.7H1.3v3.1A12 12 0 0 0 12 24Z" />
              <path fill="#FBBC05" d="M5.4 14.4A7.2 7.2 0 0 1 5 12c0-.8.1-1.6.4-2.4V6.5H1.3A12 12 0 0 0 0 12c0 1.9.4 3.8 1.3 5.5l4.1-3.1Z" />
              <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.5 1.7l3.4-3.4A11.8 11.8 0 0 0 12 0C7.3 0 3.1 2.7 1.3 6.5l4.1 3.1a7.1 7.1 0 0 1 6.6-4.8Z" />
            </svg>
            {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
          </button>

          <button
            type="submit"
            name="intent"
            value="oauth:twitter"
            disabled={navigation.state === "submitting"}
            className="w-full h-11 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-70"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
              <path d="M18.9 2H22l-6.8 7.8 8 10.2H17L12 13.6 6.4 20H3.3l7.3-8.4L3 2h6.3l4.4 5.8L18.9 2Zm-1.1 16.2h1.7L8.4 3.7H6.5l11.3 14.5Z" />
            </svg>
            {isTwitterLoading ? "Redirecting..." : "Continue with Twitter"}
          </button>
        </Form>

        <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          <span>or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <Form method="post" className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-bold text-slate-700 ml-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              placeholder="you@company.com"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-secondary/70 focus:ring-2 focus:ring-secondary/30"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-bold text-slate-700 ml-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              placeholder="••••••••"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-secondary/70 focus:ring-2 focus:ring-secondary/30"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 text-base font-bold rounded-xl shadow-lg shadow-secondary/20 transition-all duration-200 bg-secondary text-secondary-foreground hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </Form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-sm text-slate-500">
            New to DonkeySEO?{" "}
            <Link to="/register" className="font-bold text-secondary hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
