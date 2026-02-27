import { useEffect } from "react";
import { Form, data, redirect, useActionData, useFetcher, useLoaderData, useNavigation } from "react-router";
import { CheckCircle2, Loader2, MailCheck, RefreshCw } from "lucide-react";
import type { Route } from "./+types/_auth.verify-email.pending";
import { ApiClient } from "~/lib/api.server";

import type { components } from "~/types/api.generated";
type AuthMessageResponse = components["schemas"]["AuthMessageResponse"];

function parseErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Something went wrong.";
  const record = payload as Record<string, unknown>;
  const detail = record.detail;
  if (typeof detail === "string" && detail.trim().length > 0) return detail;
  const message = record.message ?? record.error;
  return typeof message === "string" && message.trim().length > 0 ? message : "Something went wrong.";
}

export async function loader({ request }: Route.LoaderArgs) {
  const api = new ApiClient(request);
  const user = await api.requireUser();

  if (user.email_verified) {
    return redirect("/project", {
      headers: await api.commit(),
    });
  }

  return data(
    {
      email: user.email,
    },
    {
      headers: await api.commit(),
    }
  );
}

export async function action({ request }: Route.ActionArgs) {
  const api = new ApiClient(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  const user = await api.requireUser();
  if (user.email_verified) {
    return redirect("/project", {
      headers: await api.commit(),
    });
  }

  if (intent === "resend") {
    let resendResponse: Response;
    try {
      resendResponse = await api.fetch("/auth/verify-email/resend", {
        method: "POST",
      });
    } catch {
      return data(
        { intent: "resend", ok: false, message: "Could not reach the server. Please try again." },
        {
          status: 503,
          headers: await api.commit(),
        }
      );
    }

    if (!resendResponse.ok) {
      let message = "Failed to resend verification email.";
      try {
        message = parseErrorMessage(await resendResponse.clone().json());
      } catch {
        message = "Failed to resend verification email.";
      }

      return data(
        { intent: "resend", ok: false, message },
        {
          status: resendResponse.status,
          headers: await api.commit(),
        }
      );
    }

    let successMessage = "Verification email sent.";
    try {
      const payload = (await resendResponse.json()) as AuthMessageResponse;
      if (payload.message?.trim()) {
        successMessage = payload.message;
      }
    } catch {
      successMessage = "Verification email sent.";
    }

    return data(
      { intent: "resend", ok: true, message: successMessage },
      {
        headers: await api.commit(),
      }
    );
  }

  if (intent === "check") {
    return data(
      {
        intent: "check",
        ok: false,
        polled: source === "poll",
        message: "Email is still not verified. Click the link in your inbox, then try again.",
      },
      {
        headers: await api.commit(),
      }
    );
  }

  return data(
    { intent: "unknown", ok: false, message: "Unsupported action." },
    { status: 400, headers: await api.commit() }
  );
}

export default function VerifyEmailPending() {
  const { email } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const poller = useFetcher<typeof action>();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      if (poller.state !== "idle") return;
      poller.submit(
        { intent: "check", source: "poll" },
        { method: "post" }
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        return;
      }
      poll();
      if (!interval) {
        interval = setInterval(poll, 20000);
      }
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [poller]);

  const activeIntent = String(navigation.formData?.get("intent") ?? "");
  const isResending = navigation.state === "submitting" && activeIntent === "resend";
  const isChecking = navigation.state === "submitting" && activeIntent === "check";

  const resendSucceeded = actionData?.intent === "resend" && actionData.ok;
  const wasPolled = Boolean(actionData && "polled" in actionData && actionData.polled === true);
  const showManualCheckMessage = actionData?.intent === "check" && !wasPolled;
  const errorMessage = actionData?.ok === false && actionData.intent !== "check" ? actionData.message : null;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white/95 backdrop-blur-sm p-8 rounded-3xl border-2 border-slate-900/15 shadow-[3px_3px_0_rgba(0,0,0,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-emerald-50 border-2 border-emerald-200 text-emerald-600">
            <MailCheck className="w-8 h-8" />
          </div>
          <h2 className="font-display text-3xl font-bold text-slate-900 mb-2">Verify your email</h2>
          <p className="text-slate-500">We sent a verification link to:</p>
          <p className="mt-1 font-semibold text-slate-700">{email}</p>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-600 mb-4">
          Click the link in your inbox to verify your account. If it does not appear, check your spam folder.
        </div>

        {resendSucceeded && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {actionData.message}
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
            {errorMessage}
          </div>
        )}

        {showManualCheckMessage && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-medium">
            {actionData.message}
          </div>
        )}

        <Form method="post" className="space-y-3">
          <button
            type="submit"
            name="intent"
            value="resend"
            disabled={isResending}
            className="w-full h-11 rounded-xl border-2 border-slate-900/10 bg-white text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 hover:translate-y-[-1px] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isResending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isResending ? "Sending..." : "Resend verification email"}
          </button>

          <button
            type="submit"
            name="intent"
            value="check"
            disabled={isChecking}
            className="w-full h-11 rounded-xl border-2 border-slate-900/10 bg-secondary text-secondary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:translate-y-[-1px] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isChecking && <Loader2 className="w-4 h-4 animate-spin" />}
            {isChecking ? "Checking..." : "I verified, continue"}
          </button>
        </Form>

        <Form method="post" action="/logout" className="mt-5 pt-5 border-t border-slate-100">
          <button
            type="submit"
            className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Back to login
          </button>
        </Form>
      </div>
    </div>
  );
}
