import { Link, isRouteErrorResponse } from "react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

type RouteErrorBoundaryVariant = "app" | "auth" | "dashboard" | "panel";

type RouteErrorBoundaryCardProps = {
  error: unknown;
  variant: RouteErrorBoundaryVariant;
  title?: string;
  description?: string;
  safeHref: string;
  safeLabel: string;
  retryLabel?: string;
  showStatus?: boolean;
};

type ResolvedRouteError = {
  status: number | null;
  statusText: string | null;
  message: string;
  details: string | null;
  stack: string | null;
};

function readRouteErrorDataMessage(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const candidates = [record.message, record.error, record.detail];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function getFriendlyStatusMessage(status: number | null) {
  if (status === 400) return "The request for this page was invalid.";
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have access to this page.";
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 409) return "This page is out of sync. Please refresh and try again.";
  if (status !== null && status >= 500) return "The server ran into an issue while loading this page.";
  return "Something unexpected happened while loading this page.";
}

export function resolveRouteError(error: unknown): ResolvedRouteError {
  if (isRouteErrorResponse(error)) {
    const details = readRouteErrorDataMessage(error.data) ?? error.statusText ?? null;
    return {
      status: error.status,
      statusText: error.statusText || null,
      message: getFriendlyStatusMessage(error.status),
      details,
      stack: null,
    };
  }

  if (error instanceof Error) {
    return {
      status: null,
      statusText: null,
      message: getFriendlyStatusMessage(null),
      details: error.message || null,
      stack: error.stack ?? null,
    };
  }

  return {
    status: null,
    statusText: null,
    message: getFriendlyStatusMessage(null),
    details: null,
    stack: null,
  };
}

function statusBadgeVariant(status: number | null): "info" | "warning" | "danger" | "muted" {
  if (status === null) return "muted";
  if (status >= 500) return "danger";
  if (status >= 400) return "warning";
  return "info";
}

function BoundaryContent({
  resolved,
  title,
  description,
  safeHref,
  safeLabel,
  retryLabel = "Retry",
  showStatus = true,
}: {
  resolved: ResolvedRouteError;
  title?: string;
  description?: string;
  safeHref: string;
  safeLabel: string;
  retryLabel?: string;
  showStatus?: boolean;
}) {
  const devDetails = import.meta.env.DEV ? resolved.details : null;
  const devStack = import.meta.env.DEV ? resolved.stack : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h2 className="font-display text-2xl font-bold text-slate-900">
            {title ?? "Something went wrong"}
          </h2>
          {showStatus && resolved.status !== null ? (
            <Badge variant={statusBadgeVariant(resolved.status)} className="text-[10px]">
              HTTP {resolved.status}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-slate-700">{description ?? resolved.message}</p>
        {resolved.statusText ? <p className="text-xs text-slate-500">{resolved.statusText}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {retryLabel}
        </Button>
        <Link to={safeHref} className={buttonVariants({ variant: "default" })}>
          {safeLabel}
        </Link>
      </div>

      {devDetails ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {devDetails}
        </div>
      ) : null}

      {devStack ? (
        <pre className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <code>{devStack}</code>
        </pre>
      ) : null}
    </div>
  );
}

export function RouteErrorBoundaryCard({
  error,
  variant,
  title,
  description,
  safeHref,
  safeLabel,
  retryLabel,
  showStatus = true,
}: RouteErrorBoundaryCardProps) {
  const resolved = resolveRouteError(error);

  if (variant === "panel") {
    return (
      <Card className="border-rose-200 bg-gradient-to-br from-white via-rose-50/60 to-amber-50/50">
        <CardHeader>
          <CardTitle className="text-xl">Page unavailable</CardTitle>
          <CardDescription>
            This section could not be rendered. Use the controls below to recover.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BoundaryContent
            resolved={resolved}
            title={title}
            description={description}
            safeHref={safeHref}
            safeLabel={safeLabel}
            retryLabel={retryLabel}
            showStatus={showStatus}
          />
        </CardContent>
      </Card>
    );
  }

  if (variant === "dashboard") {
    return (
      <div className="min-h-[100dvh] bg-background p-4 md:p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border-2 border-black bg-card p-6 shadow-[4px_4px_0_#1a1a1a] md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Dashboard</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">We hit a loading issue</h1>
          <p className="mt-2 text-sm text-slate-600">
            The dashboard shell is still available. Recover with a retry or safe navigation.
          </p>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <BoundaryContent
              resolved={resolved}
              title={title}
              description={description}
              safeHref={safeHref}
              safeLabel={safeLabel}
              retryLabel={retryLabel}
              showStatus={showStatus}
            />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "auth") {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-6 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white/95 backdrop-blur-sm p-8 rounded-3xl border-2 border-slate-900/15 shadow-[3px_3px_0_rgba(0,0,0,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 overflow-hidden bg-white border-2 border-slate-900/15">
                <img src="/static/donkey.png" alt="Donkey SEO" className="h-12 w-12 object-contain" />
              </div>
              <h1 className="font-display text-3xl font-bold text-slate-900">Authentication issue</h1>
            </div>
            <BoundaryContent
              resolved={resolved}
              title={title}
              description={description}
              safeHref={safeHref}
              safeLabel={safeLabel}
              retryLabel={retryLabel}
              showStatus={showStatus}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border-2 border-black bg-white p-6 shadow-[4px_4px_0_#1a1a1a] md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Application error</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Page crashed</h1>
          <div className={cn("mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4")}>
            <BoundaryContent
              resolved={resolved}
              title={title}
              description={description}
              safeHref={safeHref}
              safeLabel={safeLabel}
              retryLabel={retryLabel}
              showStatus={showStatus}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

