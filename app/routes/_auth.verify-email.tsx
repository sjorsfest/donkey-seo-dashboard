import { Link, data, useLoaderData } from "react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Route } from "./+types/_auth.verify-email";
import type { components } from "~/types/api.generated";
import { ApiClient } from "~/lib/api.server";
import { getSession } from "~/lib/session.server";

type UserResponse = components["schemas"]["UserResponse"];
type EmailVerificationTokenRequest = components["schemas"]["EmailVerificationTokenRequest"];

function parseErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Unable to verify this email link.";
  const record = payload as Record<string, unknown>;
  const detail = record.detail;
  if (typeof detail === "string" && detail.trim().length > 0) return detail;
  const message = record.message ?? record.error;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : "Unable to verify this email link.";
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") ?? "").trim();
  const session = await getSession(request.headers.get("Cookie"));
  const hasAccessToken = Boolean(session.get("accessToken"));
  const api = new ApiClient(request);

  if (!token) {
    return data(
      {
        ok: false,
        message: "This verification link is missing a token.",
        continueTo: hasAccessToken ? "/verify-email/pending" : "/login",
        continueLabel: hasAccessToken ? "Back to verification" : "Back to login",
      },
      { status: 400 }
    );
  }

  const payload: EmailVerificationTokenRequest = { token };
  let response: Response;
  try {
    response = await fetch(api.url("/auth/verify-email"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return data(
      {
        ok: false,
        message: "Could not reach the verification service. Please try again.",
        continueTo: hasAccessToken ? "/verify-email/pending" : "/login",
        continueLabel: hasAccessToken ? "Back to verification" : "Back to login",
      },
      { status: 503 }
    );
  }

  if (!response.ok) {
    let message = "Unable to verify this email link.";
    try {
      message = parseErrorMessage(await response.clone().json());
    } catch {
      message = "Unable to verify this email link.";
    }

    return data(
      {
        ok: false,
        message,
        continueTo: hasAccessToken ? "/verify-email/pending" : "/login",
        continueLabel: hasAccessToken ? "Back to verification" : "Back to login",
      },
      { status: response.status }
    );
  }

  let email: string | null = null;
  try {
    const user = (await response.json()) as UserResponse;
    email = user.email ?? null;
  } catch {
    email = null;
  }

  return data({
    ok: true,
    email,
    message: "Your email has been verified successfully.",
    continueTo: hasAccessToken ? "/project" : "/login",
    continueLabel: hasAccessToken ? "Continue to dashboard" : "Continue to login",
  });
}

export default function VerifyEmail() {
  const payload = useLoaderData<typeof loader>();
  const verifiedEmail =
    payload.ok && "email" in payload && typeof payload.email === "string" ? payload.email : null;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white/95 backdrop-blur-sm p-8 rounded-3xl border-2 border-slate-900/15 shadow-[3px_3px_0_rgba(0,0,0,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]">
        <div className="text-center mb-6">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border-2 ${
              payload.ok ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-rose-50 border-rose-200 text-rose-600"
            }`}
          >
            {payload.ok ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </div>

          <h2 className="font-display text-3xl font-bold text-slate-900 mb-2">
            {payload.ok ? "Email verified" : "Verification failed"}
          </h2>
          <p className="text-slate-600 text-sm">{payload.message}</p>
          {verifiedEmail && <p className="mt-2 font-semibold text-slate-700">{verifiedEmail}</p>}
        </div>

        <Link
          to={payload.continueTo}
          className="w-full h-11 rounded-xl border-2 border-slate-900/10 bg-secondary text-secondary-foreground font-semibold text-sm flex items-center justify-center hover:translate-y-[-1px] transition-all duration-200"
        >
          {payload.continueLabel}
        </Link>
      </div>
    </div>
  );
}
