import { useMemo, useState } from "react";
import { Form, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Building2, Check, CreditCard, ExternalLink, Loader2, Sprout, TrendingUp, Zap } from "lucide-react";
import type { Route } from "./+types/_dashboard.billing";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import { formatDateTime, formatStatusLabel } from "~/lib/dashboard";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";

type BillingPlansResponse = components["schemas"]["BillingPlansResponse"];
type BillingStatusResponse = components["schemas"]["BillingStatusResponse"];
type BillingUsageResponse = components["schemas"]["BillingUsageResponse"];
type PlanPriceOptionResponse = components["schemas"]["PlanPriceOptionResponse"];
type CheckoutSessionRequest = components["schemas"]["CheckoutSessionRequest"];
type CheckoutSessionResponse = components["schemas"]["CheckoutSessionResponse"];
type BillingPortalRequest = components["schemas"]["BillingPortalRequest"];
type BillingPortalResponse = components["schemas"]["BillingPortalResponse"];

type PlanName = "starter" | "growth" | "agency";
type BillingInterval = "monthly" | "yearly";
type UpgradeResult = "success" | "cancel" | null;

type LoaderData = {
  plans: BillingPlansResponse | null;
  billing: BillingStatusResponse | null;
  usage: BillingUsageResponse | null;
  result: UpgradeResult;
  loadErrors: string[];
};

type ActionData = {
  error?: string;
};

type PlanPriceMap = Record<
  PlanName,
  {
    monthly: PlanPriceOptionResponse | null;
    yearly: PlanPriceOptionResponse | null;
  }
>;

const PLAN_ORDER: PlanName[] = ["starter", "growth", "agency"];

const PLAN_META: Record<
  PlanName,
  {
    title: string;
    tagline: string;
    articles: string;
    highlights: string[];
    icon: LucideIcon;
    gradient: string;
    iconBg: string;
    iconColor: string;
    accentColor: string;
    isPopular?: boolean;
  }
> = {
  starter: {
    title: "Starter",
    tagline: "You run one website and want a steady stream of SEO content without hiring writers.",
    articles: "30 articles / month",
    highlights: [
      "1 project (domain)",
      "Automated keyword research & topic discovery",
      "Publish-ready articles with your brand voice",
    ],
    icon: Sprout,
    gradient: "from-[#e8f5f0] to-[#f0faf6]",
    iconBg: "bg-[#2f6f71]/10",
    iconColor: "text-[#2f6f71]",
    accentColor: "text-[#2f6f71]",
  },
  growth: {
    title: "Growth",
    tagline: "You manage a few brands or product lines and need enough volume to build topical authority fast.",
    articles: "100 articles / month",
    highlights: [
      "3 projects (domains)",
      "Everything in Starter",
      "3x the output to dominate your niches",
    ],
    icon: TrendingUp,
    gradient: "from-[#e8f0ff] to-[#f0f4ff]",
    iconBg: "bg-[#1e4b8f]/10",
    iconColor: "text-[#1e4b8f]",
    accentColor: "text-[#1e4b8f]",
    isPopular: true,
  },
  agency: {
    title: "Agency",
    tagline: "You run SEO for multiple clients and need serious throughput across all of them.",
    articles: "350 articles / month",
    highlights: [
      "10 projects (domains)",
      "Everything in Growth",
      "Scale content across your entire portfolio",
    ],
    icon: Building2,
    gradient: "from-[#fff5e6] to-[#fffbf3]",
    iconBg: "bg-[#8b5c1a]/10",
    iconColor: "text-[#8b5c1a]",
    accentColor: "text-[#8b5c1a]",
  },
};

const NON_ACTIVE_SUBSCRIPTION_STATUSES = new Set(["canceled", "cancelled", "incomplete_expired", "unpaid"]);

function normalizePlan(value: string | null | undefined): PlanName | null {
  if (value === "starter" || value === "growth" || value === "agency") return value;
  return null;
}

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildPriceMap(plans: PlanPriceOptionResponse[]): PlanPriceMap {
  const priceMap: PlanPriceMap = {
    starter: { monthly: null, yearly: null },
    growth: { monthly: null, yearly: null },
    agency: { monthly: null, yearly: null },
  };

  for (const entry of plans) {
    const plan = normalizePlan(entry.plan);
    if (!plan) continue;
    if (entry.interval === "monthly") priceMap[plan].monthly = entry;
    if (entry.interval === "yearly") priceMap[plan].yearly = entry;
  }

  return priceMap;
}

function formatPlanName(plan: PlanName | null) {
  if (!plan) return "Free";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

function getSavingsPercent(monthly: PlanPriceOptionResponse | null, yearly: PlanPriceOptionResponse | null) {
  if (!monthly || !yearly) return null;
  if (monthly.amount_cents <= 0) return null;
  const annualizedMonthly = monthly.amount_cents * 12;
  const ratio = 1 - yearly.amount_cents / annualizedMonthly;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return Math.round(ratio * 100);
}

function parseResultParam(requestUrl: string): UpgradeResult {
  const result = new URL(requestUrl).searchParams.get("result");
  if (result === "success" || result === "cancel") return result;
  return null;
}

function isPlanName(value: string): value is PlanName {
  return value === "starter" || value === "growth" || value === "agency";
}

function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

function getUsageTone(usagePercent: number) {
  if (usagePercent >= 95) return { bar: "bg-rose-500", text: "text-rose-600" };
  if (usagePercent >= 75) return { bar: "bg-amber-500", text: "text-amber-600" };
  return { bar: "bg-[#2f6f71]", text: "text-[#2f6f71]" };
}

async function requireActiveSession(response: Response | null, api: ApiClient) {
  if (response?.status !== 401) return null;
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

async function safeFetch(api: ApiClient, path: string, init?: RequestInit & { json?: unknown }) {
  try {
    return await api.fetch(path, init);
  } catch {
    return null;
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const api = new ApiClient(request);
  const [plansResponse, billingResponse, usageResponse] = await Promise.all([
    safeFetch(api, "/billing/plans"),
    safeFetch(api, "/billing/me"),
    safeFetch(api, "/billing/usage"),
  ]);

  const unauthorizedRedirect =
    (await requireActiveSession(billingResponse, api)) ?? (await requireActiveSession(usageResponse, api));
  if (unauthorizedRedirect) return unauthorizedRedirect;

  let plans: BillingPlansResponse | null = null;
  let billing: BillingStatusResponse | null = null;
  let usage: BillingUsageResponse | null = null;
  const loadErrors: string[] = [];

  if (plansResponse?.ok) {
    plans = (await plansResponse.json()) as BillingPlansResponse;
  } else {
    loadErrors.push("Plan catalog could not be loaded.");
  }

  if (billingResponse?.ok) {
    billing = (await billingResponse.json()) as BillingStatusResponse;
  } else if (billingResponse) {
    loadErrors.push("Current subscription status is temporarily unavailable.");
  }

  if (usageResponse?.ok) {
    usage = (await usageResponse.json()) as BillingUsageResponse;
  } else if (usageResponse) {
    loadErrors.push("Usage data is temporarily unavailable.");
  }

  return data(
    {
      plans,
      billing,
      usage,
      result: parseResultParam(request.url),
      loadErrors,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

export async function action({ request }: Route.ActionArgs) {
  const api = new ApiClient(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const currentUrl = new URL(request.url);

  if (intent === "checkout") {
    const rawPlan = String(formData.get("plan") ?? "");
    const rawInterval = String(formData.get("interval") ?? "");

    if (!isPlanName(rawPlan)) {
      return data({ error: "Invalid plan selection." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    if (!isBillingInterval(rawInterval)) {
      return data({ error: "Invalid billing interval." } satisfies ActionData, {
        status: 400,
        headers: await api.commit(),
      });
    }

    const successUrl = new URL(currentUrl.pathname, currentUrl.origin);
    successUrl.searchParams.set("result", "success");

    const cancelUrl = new URL(currentUrl.pathname, currentUrl.origin);
    cancelUrl.searchParams.set("result", "cancel");

    const payload: CheckoutSessionRequest = {
      plan: rawPlan,
      interval: rawInterval,
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
    };

    const checkoutResponse = await safeFetch(api, "/billing/checkout-session", {
      method: "POST",
      json: payload,
    });

    if (checkoutResponse?.status === 401) {
      return redirect("/login", {
        headers: {
          "Set-Cookie": await api.logout(),
        },
      });
    }

    if (!checkoutResponse?.ok) {
      const message = checkoutResponse ? await readApiErrorMessage(checkoutResponse) : null;
      return data(
        {
          error: message ?? "Unable to start checkout right now.",
        } satisfies ActionData,
        {
          status: checkoutResponse?.status ?? 502,
          headers: await api.commit(),
        }
      );
    }

    const checkoutSession = (await checkoutResponse.json()) as CheckoutSessionResponse;
    if (!checkoutSession.url) {
      return data({ error: "Checkout URL missing from billing response." } satisfies ActionData, {
        status: 502,
        headers: await api.commit(),
      });
    }

    return redirect(checkoutSession.url, {
      headers: await api.commit(),
    });
  }

  if (intent === "portal") {
    const returnUrl = new URL(currentUrl.pathname, currentUrl.origin);
    const payload: BillingPortalRequest = {
      return_url: returnUrl.toString(),
    };

    const portalResponse = await safeFetch(api, "/billing/portal-session", {
      method: "POST",
      json: payload,
    });

    if (portalResponse?.status === 401) {
      return redirect("/login", {
        headers: {
          "Set-Cookie": await api.logout(),
        },
      });
    }

    if (!portalResponse?.ok) {
      const message = portalResponse ? await readApiErrorMessage(portalResponse) : null;
      return data(
        { error: message ?? "Unable to open billing portal right now." } satisfies ActionData,
        {
          status: portalResponse?.status ?? 502,
          headers: await api.commit(),
        }
      );
    }

    const portalSession = (await portalResponse.json()) as BillingPortalResponse;
    if (!portalSession.url) {
      return data({ error: "Billing portal URL missing from response." } satisfies ActionData, {
        status: 502,
        headers: await api.commit(),
      });
    }

    return redirect(portalSession.url, {
      headers: await api.commit(),
    });
  }

  return data(
    {
      error: "Unknown billing action.",
    } satisfies ActionData,
    {
      status: 400,
      headers: await api.commit(),
    }
  );
}

export default function BillingRoute() {
  const { plans, billing, usage, result, loadErrors } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const defaultInterval: BillingInterval = billing?.subscription_interval === "yearly" ? "yearly" : "monthly";
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>(defaultInterval);

  const pricing = useMemo(() => buildPriceMap(plans?.plans ?? []), [plans?.plans]);
  const currentPlan = normalizePlan(billing?.subscription_plan ?? usage?.plan ?? null);
  const normalizedSubscriptionStatus = String(billing?.subscription_status ?? "").toLowerCase();
  const hasPaidSubscription = Boolean(currentPlan) && !NON_ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedSubscriptionStatus);
  const usagePercent = clampPercent(usage?.usage_percent);
  const usageTone = getUsageTone(usagePercent);

  const activeIntent = String(navigation.formData?.get("intent") ?? "");
  const pendingPlan = String(navigation.formData?.get("plan") ?? "");
  const pendingInterval = String(navigation.formData?.get("interval") ?? "");
  const portalSubmitting = navigation.state !== "idle" && activeIntent === "portal";
  const checkoutSubmitting = navigation.state !== "idle" && activeIntent === "checkout";

  const trialDays = plans?.trial_days ?? 0;
  const isFreeTier = !hasPaidSubscription;
  const windowLabel = usage?.window_kind === "lifetime" ? "Lifetime" : "This month";

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f0faf6] to-[#e8f5f0] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Billing</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Donkey Support</h1>
          <p className="mt-2 text-sm text-slate-600">Manage your subscription, view usage, and upgrade your plan.</p>
        </div>
      </motion.section>

      <div className="mx-auto max-w-3xl space-y-6">
        {/* Checkout result banners */}
      {result === "success" && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-900"
        >
          <p className="font-bold">You're all set!</p>
          <p className="mt-1 text-emerald-700">Your subscription is active. Usage limits have been updated.</p>
        </motion.div>
      )}

      {result === "cancel" && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-bold">Checkout canceled</p>
          <p className="mt-1 text-amber-700">No changes were made. You can upgrade whenever you're ready.</p>
        </div>
      )}

      {actionData?.error && (
        <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          <p className="font-bold">Something went wrong</p>
          <p className="mt-1 text-rose-700">{actionData.error}</p>
        </div>
      )}

      {loadErrors.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="mt-1 text-amber-700">{loadErrors.join(" ")}</p>
        </div>
      )}

      {/* Current plan card */}
      <Card className="border-2 border-black shadow-[4px_4px_0_#1a1a1a]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-[#2f6f71]" />
              Your plan
            </CardTitle>
            {billing?.subscription_status && (
              <Badge variant="muted" className="text-xs">
                {formatStatusLabel(billing.subscription_status)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-display text-3xl font-bold text-slate-900">{formatPlanName(currentPlan)}</p>
              {hasPaidSubscription && billing?.subscription_interval && (
                <p className="mt-0.5 text-sm text-slate-500">
                  Billed {billing.subscription_interval}
                  {billing.subscription_current_period_end && (
                    <> &middot; renews {formatDateTime(billing.subscription_current_period_end)}</>
                  )}
                </p>
              )}
              {isFreeTier && (
                <p className="mt-0.5 text-sm text-slate-500">5 articles included &middot; lifetime</p>
              )}
            </div>

            {hasPaidSubscription && (
              <Form method="post">
                <input type="hidden" name="intent" value="portal" />
                <Button type="submit" variant="outline" size="sm" disabled={portalSubmitting}>
                  {portalSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Manage
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </Form>
            )}
          </div>

          {/* Usage meter */}
          {usage && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-700">{windowLabel} usage</span>
                <span className={cn("font-bold tabular-nums", usageTone.text)}>
                  {usage.used_articles} / {usage.article_limit} articles
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className={cn("h-full rounded-full", usageTone.bar)}
                  initial={{ width: 0 }}
                  animate={{ width: `${usagePercent}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{usage.remaining_articles} remaining</span>
                <span>{usagePercent}% used</span>
              </div>
            </div>
          )}

          {/* Trial info for paid users */}
          {hasPaidSubscription && billing?.subscription_trial_ends_at && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Trial ends {formatDateTime(billing.subscription_trial_ends_at)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade section - shown for free users or paid users who want to change plans */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isFreeTier && <Zap className="h-5 w-5 text-[#2f6f71]" />}
            <h2 className="font-display text-xl font-bold text-slate-900">
              {isFreeTier ? "Upgrade your plan" : "Switch plan"}
            </h2>
          </div>

          <div className="inline-flex rounded-xl border-2 border-black bg-muted p-0.5 shadow-[2px_2px_0_#1a1a1a]">
            <button
              type="button"
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                selectedInterval === "monthly"
                  ? "border border-black bg-card text-slate-900 shadow-sm"
                  : "border border-transparent text-muted-foreground hover:text-slate-700"
              )}
              onClick={() => setSelectedInterval("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                selectedInterval === "yearly"
                  ? "border border-black bg-card text-slate-900 shadow-sm"
                  : "border border-transparent text-muted-foreground hover:text-slate-700"
              )}
              onClick={() => setSelectedInterval("yearly")}
            >
              Yearly
            </button>
          </div>
        </div>

        {trialDays > 0 && isFreeTier && (
          <p className="text-sm text-slate-500">All plans include a {trialDays}-day free trial.</p>
        )}

        <div className="grid gap-3 pt-3 sm:grid-cols-3">
          {PLAN_ORDER.map((plan) => {
            const meta = PLAN_META[plan];
            const monthlyPrice = pricing[plan].monthly;
            const yearlyPrice = pricing[plan].yearly;
            const selectedPrice = selectedInterval === "monthly" ? monthlyPrice : yearlyPrice;
            const savingsPercent = getSavingsPercent(monthlyPrice, yearlyPrice);
            const isCurrentPlan =
              currentPlan === plan &&
              billing?.subscription_interval === selectedInterval &&
              !NON_ACTIVE_SUBSCRIPTION_STATUSES.has(String(billing?.subscription_status ?? "").toLowerCase());
            const cardSubmitting = checkoutSubmitting && pendingPlan === plan && pendingInterval === selectedInterval;

            return (
              <div key={plan} className="relative">
                {/* Badges sit outside the card so they aren't clipped */}
                {meta.isPopular && (
                  <div className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2">
                    <Badge variant="default" className="text-[10px]">
                      Popular
                    </Badge>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-2.5 right-3 z-10">
                    <Badge variant="success" className="text-[10px]">
                      Current
                    </Badge>
                  </div>
                )}

                <Card
                  className={cn(
                    "flex h-full flex-col overflow-hidden border-2 transition-shadow",
                    isCurrentPlan
                      ? "border-[#2f6f71] shadow-[3px_3px_0_#2f6f71]"
                      : "border-black shadow-[3px_3px_0_#1a1a1a] hover:shadow-[4px_4px_0_#1a1a1a]"
                  )}
                >
                  {/* Gradient header with icon */}
                  <div className={cn("flex items-center gap-3 bg-gradient-to-br px-5 pb-4 pt-5", meta.gradient)}>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-black shadow-[2px_2px_0_#1a1a1a]", meta.iconBg)}>
                      <meta.icon className={cn("h-5 w-5", meta.iconColor)} />
                    </div>
                    <div>
                      <p className={cn("font-display text-lg font-bold", meta.accentColor)}>{meta.title}</p>
                      <p className="text-[12px] leading-snug text-slate-500">{meta.tagline}</p>
                    </div>
                  </div>

                  <CardContent className="flex flex-1 flex-col p-5">
                    <div>
                      <span className="font-display text-2xl font-bold text-slate-900">
                        {selectedPrice ? formatMoney(selectedPrice.amount_cents, selectedPrice.currency) : "--"}
                      </span>
                      <span className="text-xs text-slate-500">
                        /{selectedInterval === "monthly" ? "mo" : "yr"}
                      </span>
                    </div>

                    {selectedInterval === "yearly" && savingsPercent ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-600">Save {savingsPercent}%</p>
                    ) : (
                      <p className="mt-1 text-xs text-transparent select-none">&nbsp;</p>
                    )}

                    <ul className="mt-4 space-y-2">
                      <li className="flex items-start gap-2 text-sm font-medium text-slate-800">
                        <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", meta.iconColor)} />
                        {meta.articles}
                      </li>
                      {meta.highlights.map((line) => (
                        <li key={line} className="flex items-start gap-2 text-[13px] text-slate-600">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          {line}
                        </li>
                      ))}
                    </ul>

                    <Form method="post" className="mt-auto pt-5">
                      <input type="hidden" name="intent" value="checkout" />
                      <input type="hidden" name="plan" value={plan} />
                      <input type="hidden" name="interval" value={selectedInterval} />
                      <Button
                        type="submit"
                        size="sm"
                        className="w-full"
                        variant={isCurrentPlan ? "outline" : "default"}
                        disabled={!selectedPrice || isCurrentPlan || checkoutSubmitting}
                      >
                        {cardSubmitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isCurrentPlan ? (
                          "Current plan"
                        ) : trialDays > 0 && isFreeTier ? (
                          "Start trial"
                        ) : (
                          <>
                            {isFreeTier ? "Upgrade" : "Switch"}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                    </Form>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
