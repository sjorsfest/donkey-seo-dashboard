import { Form, Link, data, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_auth.login";
import type { components } from "~/types/api.generated";
import { ApiClient } from "~/lib/api.server";
import { commitSession, getSession } from "~/lib/session.server";

type Token = components["schemas"]["Token"];

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
  const isLoading = navigation.state === "submitting";

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
            className="w-full h-11 text-base font-bold rounded-xl shadow-lg shadow-secondary/20 transition-all duration-200 bg-secondary text-white hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
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
