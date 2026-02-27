import { useMemo, useState } from "react";
import {
  Form,
  Link,
  Outlet,
  data,
  redirect,
  useLoaderData,
  useLocation,
} from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  CalendarDays,
  Compass,
  CreditCard,
  FolderKanban,
  LogOut,
  PenSquare,
  Plus,
  Settings2,
} from "lucide-react";
import type { Route } from "./+types/_dashboard";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Drawer } from "~/components/ui/drawer";
import { Switch } from "~/components/ui/switch";
import { ApiClient } from "~/lib/api.server";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";
import { OnboardingProvider, useOnboarding } from "~/components/onboarding/onboarding-context";
import { OnboardingOverlay } from "~/components/onboarding/onboarding-overlay";
import { DonkeyBubble } from "~/components/onboarding/donkey-bubble";
import { NavExplainerOverlay } from "~/components/onboarding/nav-explainer-overlay";
import { SupportWidget } from "~/components/SupportWidget";
import { signWidgetMetadataToken } from "~/lib/widget-metadata-signing.server";

type UserResponse = components["schemas"]["UserResponse"];
type BillingStatusResponse = components["schemas"]["BillingStatusResponse"];
type BillingUsageResponse = components["schemas"]["BillingUsageResponse"];
type ProjectListResponse = components["schemas"]["ProjectListResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];

type PlanName = "starter" | "growth" | "agency";
type ProjectSummary = Pick<ProjectResponse, "id" | "name" | "domain" | "status">;

type Entitlements = {
  hasProPlan: boolean;
  canManageMultipleProjects: boolean;
  canCreateAdditionalProject: boolean;
  currentPlanLabel: string;
  usage: BillingUsageResponse | null;
  showFreeUsageInNav: boolean;
  maxProjects: number;
};

type LoaderData = {
  user: UserResponse;
  projectCount: number;
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  activeProjectId: string | null;
  entitlements: Entitlements;
  supportAccountId: string;
  supportWidgetMetadataToken: string | null;
};

type NavContext = {
  activeProjectId: string | null;
  hasProPlan: boolean;
};

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  colorClass: string;
  path?: string;
  getPath?: (context: NavContext) => string | null;
  isActive?: (pathname: string) => boolean;
  matchExact?: boolean;
  hideOnMobile?: boolean;
  lockedMessage?: string;
  planLockedMessage?: string;
  requiresPlan?: boolean;
};

const NON_ENTITLED_STATUSES = new Set(["canceled", "cancelled", "incomplete_expired", "unpaid"]);
const ACTIVE_PROJECT_SESSION_KEY = "activeProjectId";
const SUPPORT_WIDGET_BASE_URL = "https://app.donkey.support";
const PLAN_PROJECT_LIMIT: Record<PlanName, number> = {
  starter: 1,
  growth: 3,
  agency: 10,
};

function normalizePlan(value: string | null | undefined): PlanName | null {
  if (value === "starter" || value === "growth" || value === "agency") return value;
  return null;
}

function toPlanLabel(plan: PlanName | null) {
  if (!plan) return "Free";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeSessionProjectId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getProjectIdFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "projects") return null;
  const candidate = segments[1];
  if (!candidate || candidate === "new" || candidate === "setup-task") return null;
  return candidate;
}

function getProjectSwitchTarget(pathname: string, projectId: string) {
  if (pathname.includes("/discovery")) return `/projects/${projectId}/discovery`;
  if (pathname.includes("/creation")) return `/projects/${projectId}/creation`;
  if (pathname.includes("/calendar")) return `/projects/${projectId}/calendar`;
  return `/projects/${projectId}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const api = new ApiClient(request);
  const user = await api.requireUser();
  if (!user.email_verified) {
    return redirect("/verify-email/pending", {
      headers: await api.commit(),
    });
  }

  const url = new URL(request.url);
  const urlProjectId = getProjectIdFromPath(url.pathname);

  let projectsLoaded = false;
  let projectCount = -1;
  let projects: ProjectSummary[] = [];
  let billingStatus: BillingStatusResponse | null = null;
  let usage: BillingUsageResponse | null = null;

  try {
    const [projectsRes, billingRes, usageRes] = await Promise.all([
      api.fetch("/projects/?page=1&page_size=100"),
      api.fetch("/billing/me"),
      api.fetch("/billing/usage"),
    ]);

    if (projectsRes.ok) {
      projectsLoaded = true;
      const payload = (await projectsRes.json()) as ProjectListResponse;
      const projectItems = (payload.items ?? []) as ProjectResponse[];
      projectCount = typeof payload.total === "number" ? payload.total : projectItems.length;
      projects = projectItems.map((project) => ({
        id: project.id,
        name: project.name,
        domain: project.domain,
        status: project.status,
      }));
    }

    if (billingRes.ok) {
      billingStatus = (await billingRes.json()) as BillingStatusResponse;
    }

    if (usageRes.ok) {
      usage = (await usageRes.json()) as BillingUsageResponse;
    }
  } catch {
    // Non-critical — shell falls back to conservative defaults.
  }

  const resolvedPlan = normalizePlan(billingStatus?.subscription_plan ?? usage?.plan ?? null);
  const normalizedStatus = String(billingStatus?.subscription_status ?? "").toLowerCase();
  const hasProPlan = Boolean(resolvedPlan) && !NON_ENTITLED_STATUSES.has(normalizedStatus);
  const showFreeUsageInNav = Boolean(usage && !hasProPlan && usage.window_kind === "lifetime");
  const maxProjects = resolvedPlan ? PLAN_PROJECT_LIMIT[resolvedPlan] : 1;
  const canManageMultipleProjects = hasProPlan && (resolvedPlan === "growth" || resolvedPlan === "agency");
  const canCreateAdditionalProject = canManageMultipleProjects && projectCount >= 0 && projectCount < maxProjects;
  const supportAccountId = process.env.SUPPORT_ACCOUNT_ID ?? "";
  const supportWidgetMetadataSigningSecret = process.env.SUPPORT_WIDGET_METADATA_SIGNING_SECRET ?? "";
  const supportWidgetMetadata = {
    plan: hasProPlan ? "pro" : "freemium",
    stripeCustomerId: billingStatus?.stripe_customer_id ?? null,
    donkeySharedSessionId: user.id,
  };
  const supportWidgetMetadataToken = supportWidgetMetadataSigningSecret
    ? signWidgetMetadataToken(supportWidgetMetadata, supportWidgetMetadataSigningSecret)
    : null;

  const sessionProjectId = normalizeSessionProjectId(await api.getSessionValue(ACTIVE_PROJECT_SESSION_KEY));
  const activeProject = projectsLoaded
    ? (urlProjectId ? projects.find((project) => project.id === urlProjectId) : null) ??
      (sessionProjectId ? projects.find((project) => project.id === sessionProjectId) : null) ??
      projects[0] ??
      null
    : null;

  if (projectsLoaded) {
    if (activeProject && activeProject.id !== sessionProjectId) {
      await api.setSessionValue(ACTIVE_PROJECT_SESSION_KEY, activeProject.id);
    }

    if (!activeProject && sessionProjectId) {
      await api.unsetSessionValue(ACTIVE_PROJECT_SESSION_KEY);
    }
  }

  return data(
    {
      user,
      projectCount,
      projects,
      activeProject,
      activeProjectId: activeProject?.id ?? null,
      entitlements: {
        hasProPlan,
        canManageMultipleProjects,
        canCreateAdditionalProject,
        currentPlanLabel: hasProPlan ? toPlanLabel(resolvedPlan) : "Free",
        usage,
        showFreeUsageInNav,
        maxProjects,
      } satisfies Entitlements,
      supportAccountId,
      supportWidgetMetadataToken,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    }
  );
}

const navItems: NavItem[] = [
  {
    id: "discovery",
    label: "Discovery",
    icon: Compass,
    colorClass: "text-emerald-600",
    getPath: (context) =>
      context.activeProjectId ? `/projects/${context.activeProjectId}/discovery` : "/project",
    isActive: (pathname) => pathname.includes("/discovery"),
  },
  {
    id: "content",
    label: "Content",
    icon: PenSquare,
    colorClass: "text-orange-500",
    getPath: (context) =>
      context.activeProjectId ? `/projects/${context.activeProjectId}/creation` : "/project",
    isActive: (pathname) => pathname.includes("/creation"),
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    colorClass: "text-fuchsia-600",
    getPath: (context) =>
      context.activeProjectId ? `/projects/${context.activeProjectId}/calendar` : "/project",
    isActive: (pathname) => pathname.includes("/calendar"),
  },
  {
    id: "billing",
    label: "Billing",
    icon: CreditCard,
    colorClass: "text-sky-600",
    path: "/billing",
    isActive: (pathname) => pathname.startsWith("/billing"),
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings2,
    colorClass: "text-cyan-600",
    path: "/settings",
    isActive: (pathname) => pathname.startsWith("/settings"),
  },
];

export default function DashboardLayout() {
  const {
    user,
    entitlements,
    projectCount,
    projects,
    activeProject,
    activeProjectId,
    supportAccountId,
    supportWidgetMetadataToken,
  } =
    useLoaderData<typeof loader>() as LoaderData;

  return (
    <OnboardingProvider projectCount={projectCount}>
      <DashboardLayoutInner
        user={user}
        entitlements={entitlements}
        projects={projects}
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        supportAccountId={supportAccountId}
        supportWidgetMetadataToken={supportWidgetMetadataToken}
      />
    </OnboardingProvider>
  );
}

function DashboardLayoutInner({
  user,
  entitlements,
  projects,
  activeProject,
  activeProjectId,
  supportAccountId,
  supportWidgetMetadataToken,
}: {
  user: UserResponse;
  entitlements: Entitlements;
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  activeProjectId: string | null;
  supportAccountId: string;
  supportWidgetMetadataToken: string | null;
}) {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const onboarding = useOnboarding();

  const [tooltipItemId, setTooltipItemId] = useState<string | null>(null);
  const [projectTooltip, setProjectTooltip] = useState<"switch" | "add" | null>(null);
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);
  const [supportEnabled, setSupportEnabled] = useState(false);

  const navContext = useMemo<NavContext>(
    () => ({
      activeProjectId,
      hasProPlan: entitlements.hasProPlan,
    }),
    [activeProjectId, entitlements.hasProPlan]
  );

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : {
        type: "spring" as const,
        stiffness: 300,
        damping: 30,
      };

  const wordmarkStyle = {
    textShadow: "-1px -1px 0 #111827, 1px -1px 0 #111827, -1px 1px 0 #111827, 1px 1px 0 #111827",
  };
  const navUsagePercent = clampPercent(entitlements.usage?.usage_percent ?? 0);

  const switchDisabledReason = !entitlements.canManageMultipleProjects
    ? "Upgrade to Growth or Agency to switch between projects."
    : projects.length <= 1
      ? "Add at least one more project to switch active projects."
      : "";

  const addDisabledReason = !entitlements.canManageMultipleProjects
    ? "Upgrade to Growth or Agency to add additional projects."
    : entitlements.canCreateAdditionalProject
      ? ""
      : `You've reached the ${entitlements.maxProjects}-project limit for your current plan.`;

  const canSwitchProjects = switchDisabledReason.length === 0;
  const canAddProjects = addDisabledReason.length === 0;

  const renderNavItem = (item: NavItem, isMobile = false) => {
    const href = item.path ?? item.getPath?.(navContext) ?? null;
    const isPlanLocked = Boolean(item.requiresPlan && !navContext.hasProPlan);
    const isOnboardingLocked =
      onboarding.state.isActive &&
      onboarding.state.phase !== "nav_explainer" &&
      item.id !== "project";
    const isLocked = !isPlanLocked && !isOnboardingLocked && !href;
    const isDisabled = isPlanLocked || isLocked || isOnboardingLocked;

    const isActive = item.isActive
      ? item.isActive(location.pathname)
      : href
        ? item.matchExact
          ? location.pathname === href
          : location.pathname.startsWith(href)
        : false;

    const message = isPlanLocked
      ? item.planLockedMessage ?? "Upgrade required to access this section."
      : isOnboardingLocked
        ? "Complete the guided setup to unlock this section."
        : isLocked
          ? item.lockedMessage ?? "This section is currently locked."
          : "";

    const baseItemClass = cn(
      isMobile ? "flex-1 flex justify-center" : "block w-full text-left",
      "rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-card"
    );

    const navContent = (
      <div
        className={cn(
          "relative flex items-center overflow-hidden transition-all duration-200 group",
          isMobile
            ? cn(
                "flex-col gap-1 rounded-xl px-3 py-2",
                isDisabled
                  ? "cursor-not-allowed opacity-60 text-muted-foreground"
                  : isActive
                    ? "text-primary-700"
                    : "text-muted-foreground"
              )
            : cn(
                "gap-3 rounded-xl px-4 py-3",
                isDisabled
                  ? "cursor-not-allowed opacity-60 text-muted-foreground"
                  : isActive
                    ? "text-primary-700"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
        )}
      >
        {isActive && !isDisabled && (
          <motion.div
            layoutId={isMobile ? "seo-nav-active-mobile" : "seo-nav-active-desktop"}
            className={cn(
              "absolute inset-0 rounded-xl",
              isMobile ? "bg-primary/20" : "bg-primary/10"
            )}
            initial={false}
            transition={transition}
          />
        )}

        <item.icon
          className={cn(
            "relative z-10 h-5 w-5 transition-transform",
            isMobile ? "" : "group-hover:scale-110 group-hover:rotate-3",
            isDisabled ? "text-muted-foreground" : isActive ? "text-primary-700" : item.colorClass
          )}
        />

        <span className={cn("relative z-10 font-medium", isMobile ? "text-[10px]" : "text-sm")}>
          {item.label}
        </span>
      </div>
    );

    if (isDisabled) {
      return (
        <button
          key={item.id}
          type="button"
          aria-disabled="true"
          title={message}
          data-nav-id={item.id}
          className={cn("relative", baseItemClass)}
          onMouseEnter={() => !isMobile && setTooltipItemId(item.id)}
          onMouseLeave={() => !isMobile && setTooltipItemId(null)}
          onFocus={() => !isMobile && setTooltipItemId(item.id)}
          onBlur={() => !isMobile && setTooltipItemId(null)}
        >
          {navContent}
          {!isMobile && tooltipItemId === item.id ? (
            <div className="absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border-2 border-black bg-card px-3 py-1.5 text-xs text-foreground shadow-[2px_2px_0_#1a1a1a]">
              {message}
            </div>
          ) : null}
        </button>
      );
    }

    if (!href) return null;

    return (
      <Link key={item.id} to={href} data-nav-id={item.id} className={baseItemClass}>
        {navContent}
      </Link>
    );
  };

  const renderActiveProjectBlock = (isMobile = false) => (
    <div
      data-nav-id="active-project"
      className={cn(
        isMobile ? "" : "mb-1 border-b border-border/40 pb-3"
      )}
    >
      <div className="flex items-center gap-1">
        <Link
          to="/project"
          className={cn(
            "group flex min-w-0 flex-1 items-center gap-3 rounded-xl transition-colors hover:bg-muted",
            isMobile ? "px-3 py-2" : "px-4 py-2.5"
          )}
        >
          <FolderKanban className="h-5 w-5 shrink-0 text-primary-700 transition-transform group-hover:scale-110 group-hover:rotate-3" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-primary-700">
              {activeProject?.name ?? "No project"}
            </p>
            <p className="truncate text-[11px] text-slate-400">
              {activeProject?.domain ?? "Create a project"}
            </p>
          </div>
        </Link>

        <div className="relative flex shrink-0 items-center gap-0.5 pr-1">
          {canSwitchProjects ? (
            <button
              type="button"
              title="Switch project"
              aria-label="Switch project"
              onClick={() => setIsProjectSwitcherOpen(true)}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-slate-600"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Switch project"
              className="rounded-lg p-1.5 text-slate-400 opacity-40 cursor-not-allowed"
              onMouseEnter={() => setProjectTooltip("switch")}
              onMouseLeave={() => setProjectTooltip(null)}
              onFocus={() => setProjectTooltip("switch")}
              onBlur={() => setProjectTooltip(null)}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          )}
          {canAddProjects ? (
            <Link to="/projects/new" aria-label="Add project" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-slate-600 inline-flex">
              <Plus className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <button
              type="button"
              aria-label="Add project"
              className="rounded-lg p-1.5 text-slate-400 opacity-40 cursor-not-allowed"
              onMouseEnter={() => setProjectTooltip("add")}
              onMouseLeave={() => setProjectTooltip(null)}
              onFocus={() => setProjectTooltip("add")}
              onBlur={() => setProjectTooltip(null)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {projectTooltip && (
            <div className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-lg border-2 border-black bg-card px-3 py-2 text-xs text-foreground shadow-[2px_2px_0_#1a1a1a]">
              <p className="font-semibold text-slate-800">
                {projectTooltip === "switch" ? "Can't switch projects" : "Can't add projects"}
              </p>
              <p className="mt-0.5 text-slate-500">
                {projectTooltip === "switch" ? switchDisabledReason : addDisabledReason}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <SupportWidget
        accountId={supportAccountId}
        baseUrl={SUPPORT_WIDGET_BASE_URL}
        email={user.email}
        name={user.full_name ?? undefined}
        metadataToken={supportWidgetMetadataToken ?? undefined}
        controlledByHost={true}
        widgetIsOpen={supportEnabled}
        onClose={() => setSupportEnabled(false)}
      />
      <div className="min-h-[100dvh] h-[100dvh] flex flex-col md:flex-row bg-background font-sans md:overflow-hidden">
      <aside
        className="hidden md:flex h-[calc(100vh-2rem)] w-72 flex-shrink-0 flex-col overflow-hidden rounded-3xl border-2 border-black bg-card m-4"
        style={{ boxShadow: "4px 4px 0px 0px #1a1a1a" }}
      >
        <div className="border-b border-border/60 p-6">
          <Link to="/project" className="flex items-center gap-0">
            <div className="group relative">
              <img
                src="/static/donkey.png"
                alt="Donkey SEO"
                className="h-16 w-16 object-contain transition-transform duration-300 group-hover:scale-110"
              />
              <div className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full border-2 border-white bg-secondary animate-bounce-subtle" />
            </div>
            <div className="flex flex-col items-center justify-center">
              <h1
                className="font-display select-none text-center text-4xl font-bold leading-[0.8] tracking-tight text-primary-500"
                style={wordmarkStyle}
              >
                <span className="block">Donkey</span>
                <span className="block">SEO</span>
              </h1>
              <span className="mt-1 -mb-2 text-xs font-medium text-muted-foreground">{entitlements.currentPlanLabel}</span>
            </div>
          </Link>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-2 overflow-y-auto p-4">
          {renderActiveProjectBlock(false)}
          {navItems.map((item) => renderNavItem(item, false))}
        </nav>

        {entitlements.showFreeUsageInNav && entitlements.usage ? (
          <div className="mx-4 mb-3 rounded-2xl border border-[#2f6f71]/25 bg-gradient-to-r from-[#f4faf8] to-[#eef5ff] p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#215d5f]">Free usage</p>
              <p className="text-xs font-semibold text-[#1f2937]">
                {entitlements.usage.used_articles}/{entitlements.usage.article_limit}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#cddfdb]">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  navUsagePercent >= 90 ? "bg-rose-500" : navUsagePercent >= 70 ? "bg-amber-500" : "bg-[#2f6f71]"
                )}
                style={{ width: `${navUsagePercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-[#46656f]">
              {entitlements.usage.remaining_articles} articles left. Upgrade for monthly limits.
            </p>
            <Link
              to="/billing"
              className="mt-2 inline-flex rounded-lg border border-[#2f6f71]/35 bg-white px-2 py-1 text-[11px] font-semibold text-[#215d5f] transition-colors hover:bg-[#e7f4f0]"
            >
              View plans
            </Link>
          </div>
        ) : null}

        <div className="px-3 pb-2">
          <div className="flex items-center gap-4 rounded-xl px-4 py-3 text-muted-foreground">
            <span className="font-sm">Need help? Toggle this!</span>
            <Switch
              checked={supportEnabled}
              onChange={(event) => setSupportEnabled(event.target.checked)}
              className="h-5 w-9 border-2 border-black bg-white shadow-[2px_2px_0_#1a1a1a] after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:border-2 after:border-black after:bg-white peer-checked:after:translate-x-4"
            />
          </div>
        </div>

        <div className="border-t border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/60">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-black bg-gradient-to-br from-secondary-700 to-secondary-300 text-xs font-bold text-primary-950 shadow-[2px_2px_0_#1a1a1a]">
              {(user.full_name?.[0] ?? user.email[0]).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{user.full_name ?? "SEO Operator"}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Form method="post" action="/logout">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                title="Log out"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </Form>
          </div>
        </div>
      </aside>

      <header className="md:hidden border-b-2 border-black bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link to="/project" className="flex items-center gap-2 min-w-0">
            <img src="/static/donkey.png" alt="Donkey SEO" className="h-10 w-10 object-contain" />
            <div className="min-w-0">
              <h1
                className="font-display text-primary-500 text-[1.1rem] font-bold leading-[0.85] tracking-tight"
                style={wordmarkStyle}
              >
                <span className="block">Donkey</span>
                <span className="block">SEO</span>
              </h1>
              <span className="text-[10px] font-medium text-muted-foreground">Pipeline Dashboard</span>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            {entitlements.showFreeUsageInNav && entitlements.usage ? (
              <Link
                to="/billing"
                className="rounded-full border border-[#2f6f71]/30 bg-white px-2.5 py-1 text-[10px] font-semibold text-[#215d5f]"
              >
                Free {entitlements.usage.used_articles}/{entitlements.usage.article_limit}
              </Link>
            ) : null}
            <Form method="post" action="/logout">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                title="Log out"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </Form>
          </div>
        </div>

        <div className="mt-3">{renderActiveProjectBlock(true)}</div>
      </header>

      <main className="relative flex flex-1 flex-col bg-white/90 md:my-4 md:mr-4 md:overflow-hidden md:rounded-3xl md:border-2 md:border-black md:[box-shadow:4px_4px_0px_0px_#1a1a1a]">
        <div className="pointer-events-none absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-white/40 to-transparent" />
        <div className="relative min-h-0 flex-1 p-4 pb-24 md:overflow-y-auto md:p-6 md:pb-6">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-black bg-card px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="flex items-center justify-around">
          {navItems.filter((item) => !item.hideOnMobile).map((item) => renderNavItem(item, true))}
        </div>
      </nav>

      <Drawer
        open={isProjectSwitcherOpen}
        onClose={() => setIsProjectSwitcherOpen(false)}
        title="Switch active project"
        description="Choose which project context your dashboard should use."
      >
        <div className="space-y-2">
          {projects.length === 0 ? (
            <p className="text-sm text-slate-600">No projects available yet.</p>
          ) : (
            projects.map((project) => {
              const isActiveProject = project.id === activeProject?.id;
              const target = getProjectSwitchTarget(location.pathname, project.id);

              return (
                <Link
                  key={project.id}
                  to={target}
                  className={cn(
                    "block rounded-xl border px-3 py-2 transition-colors",
                    isActiveProject
                      ? "border-primary-600 bg-primary-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                  onClick={() => setIsProjectSwitcherOpen(false)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{project.name}</p>
                      <p className="truncate text-xs text-slate-500">{project.domain}</p>
                    </div>
                    {isActiveProject ? <Badge variant="info">Active</Badge> : null}
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          {canAddProjects ? (
            <Link to="/projects/new" onClick={() => setIsProjectSwitcherOpen(false)}>
              <Button type="button" className="w-full">
                Add new project
              </Button>
            </Link>
          ) : (
            <p className="text-sm text-slate-600">{addDisabledReason}</p>
          )}
        </div>
      </Drawer>

      {onboarding.isPhase("congratulations") && (
        <OnboardingOverlay
          onNext={() => onboarding.advance()}
          nextLabel="Show me around!"
        >
          <DonkeyBubble title="Discovery is running!">
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              I've kicked off the <strong className="text-slate-800">Topic Discovery</strong> process. Here's what's happening:
            </p>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                <span>Researching <strong className="text-slate-800">keywords</strong> your audience is searching for</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                <span>Identifying <strong className="text-slate-800">topic clusters</strong> to build authority</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                <span>Finding gaps where your brand can <strong className="text-slate-800">outrank competitors</strong></span>
              </li>
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              This runs in the background — let me give you a <strong className="text-slate-800">quick tour</strong> of the dashboard while we wait.
            </p>
          </DonkeyBubble>
        </OnboardingOverlay>
      )}

      {onboarding.isPhase("nav_explainer") && (
        <NavExplainerOverlay
          onComplete={() => onboarding.advance()}
        />
      )}
      </div>
    </>
  );
}
