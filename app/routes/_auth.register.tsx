import { Form, Link, data, redirect, useActionData, useNavigation } from "react-router";
import { Loader2 } from "lucide-react";
import type { Route } from "./+types/_auth.register";
import type { components } from "~/types/api.generated";
import { ApiClient } from "~/lib/api.server";
import { commitSession, getSession } from "~/lib/session.server";

type Token = components["schemas"]["Token"];
type UserCreate = components["schemas"]["UserCreate"];
type UserResponse = components["schemas"]["UserResponse"];

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const accessToken = session.get("accessToken") as string | undefined;
  if (accessToken) {
    const api = new ApiClient(request);
    try {
      const meResponse = await fetch(api.url("/auth/me"), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meResponse.ok) {
        const user = (await meResponse.json()) as UserResponse;
        return redirect(user.email_verified ? "/project" : "/verify-email/pending");
      }
    } catch {
      // Fall back to dashboard redirect if user lookup fails.
    }
    return redirect("/project");
  }
  return null;
}

function parseErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Unable to create account.";
  const record = payload as Record<string, unknown>;
  const message = record.message ?? record.error ?? record.detail;
  return typeof message === "string" ? message : "Unable to create account.";
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || !password) {
    return data({ error: "Email and password are required." }, { status: 400 });
  }

  const payload: UserCreate = {
    email,
    password,
    full_name: fullName || null,
  };

  const api = new ApiClient(request);
  const registerResponse = await fetch(api.url("/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!registerResponse.ok) {
    let message = "Unable to create account.";
    try {
      message = parseErrorMessage(await registerResponse.clone().json());
    } catch {
      message = "Unable to create account.";
    }
    return data({ error: message }, { status: registerResponse.status });
  }

  const loginResponse = await fetch(api.url("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!loginResponse.ok) {
    return data({ error: "Account created, but login failed. Please log in." }, { status: 400 });
  }

  const tokens = (await loginResponse.json()) as Token;
  const session = await getSession(request.headers.get("Cookie"));
  session.set("accessToken", tokens.access_token);
  session.set("refreshToken", tokens.refresh_token);

  let redirectTo = "/project";
  try {
    const meResponse = await fetch(api.url("/auth/me"), {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meResponse.ok) {
      const user = (await meResponse.json()) as UserResponse;
      if (!user.email_verified) {
        redirectTo = "/verify-email/pending";
      }
    }
  } catch {
    // Fall back to dashboard redirect if user lookup fails.
  }

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function Register() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white/95 backdrop-blur-sm p-8 rounded-3xl border-2 border-slate-900/15 shadow-[3px_3px_0_rgba(0,0,0,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transform -rotate-3 hover:-rotate-6 transition-transform duration-500 overflow-hidden bg-white border-2 border-slate-900/15 cursor-pointer">
            <img src="/static/donkey.png" alt="DonkeySEO" className="w-12 h-12 object-contain" />
          </div>
          <h2 className="font-display text-3xl font-bold text-slate-900 mb-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            Create your account
          </h2>
          <p className="text-slate-500">Start building your SEO pipeline in minutes.</p>
        </div>

        {actionData?.error && (
          <div className="mb-6 p-4 bg-rose-50 border-2 border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="full_name" className="block text-sm font-semibold text-slate-700">
              Full name
            </label>
            <input
              type="text"
              id="full_name"
              name="full_name"
              placeholder="Jordan Smith"
              className="h-11 w-full rounded-xl border-2 border-slate-900/10 px-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/20 focus:translate-y-[-1px]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              placeholder="you@company.com"
              className="h-11 w-full rounded-xl border-2 border-slate-900/10 px-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/20 focus:translate-y-[-1px]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              placeholder="At least 8 characters"
              className="h-11 w-full rounded-xl border-2 border-slate-900/10 px-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/20 focus:translate-y-[-1px]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            aria-label={isLoading ? "Creating account, please wait" : "Create your account"}
            className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-secondary/20 transition-all duration-200 bg-secondary text-secondary-foreground hover:scale-[1.02] hover:border-t-2 hover:border-t-yellow-400 active:scale-[0.98] disabled:opacity-70 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isLoading ? "Creating account..." : "Create account"}
          </button>
        </Form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="font-bold text-secondary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
