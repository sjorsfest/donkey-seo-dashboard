import { useMemo, useState } from "react";
import {
  Form,
  Link,
  Outlet,
  data,
  useLoaderData,
  useLocation,
} from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Compass,
  LogOut,
  FolderKanban,
  PenSquare,
} from "lucide-react";
import type { Route } from "./+types/_dashboard";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { ApiClient } from "~/lib/api.server";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";

type UserResponse = components["schemas"]["UserResponse"];

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

export async function loader({ request }: Route.LoaderArgs) {
  const api = new ApiClient(request);
  const user = await api.requireUser();

  return data(
    {
      user,
      // Keep entitlement logic at shell level; wire these to API fields when available.
      entitlements: {
        hasProPlan: false,
      },
    },
    {
      headers: await api.commit(),
    }
  );
}

const navItems: NavItem[] = [
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    colorClass: "text-primary-700",
    path: "/projects",
    isActive: (pathname) => pathname === "/projects",
  },
  {
    id: "discovery",
    label: "Discovery",
    icon: Compass,
    colorClass: "text-emerald-600",
    getPath: (context) =>
      context.activeProjectId ? `/projects/${context.activeProjectId}/discovery` : "/projects",
    isActive: (pathname) => pathname.includes("/discovery"),
  },
  {
    id: "content",
    label: "Content",
    icon: PenSquare,
    colorClass: "text-orange-500",
    getPath: (context) =>
      context.activeProjectId ? `/projects/${context.activeProjectId}/creation` : "/projects",
    isActive: (pathname) => pathname.includes("/creation"),
  },
  {
    id: "insights",
    label: "Insights",
    icon: BarChart3,
    colorClass: "text-violet-600",
    path: "/projects",
    requiresPlan: true,
    planLockedMessage: "Upgrade to Pro to unlock Insights.",
  },
];

function getActiveProjectId(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "projects") return null;
  const candidate = segments[1];
  if (!candidate || candidate === "new") return null;
  return candidate;
}

export default function DashboardLayout() {
  const { user, entitlements } = useLoaderData<typeof loader>() as {
    user: UserResponse;
    entitlements: { hasProPlan: boolean };
  };
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  const [tooltipItemId, setTooltipItemId] = useState<string | null>(null);

  const navContext = useMemo<NavContext>(
    () => ({
      activeProjectId: getActiveProjectId(location.pathname),
      hasProPlan: entitlements.hasProPlan,
    }),
    [location.pathname, entitlements.hasProPlan]
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

  const renderNavItem = (item: NavItem, isMobile = false) => {
    const href = item.path ?? item.getPath?.(navContext) ?? null;
    const isPlanLocked = Boolean(item.requiresPlan && !navContext.hasProPlan);
    const isLocked = !isPlanLocked && !href;
    const isDisabled = isPlanLocked || isLocked;

    const isActive = item.isActive
      ? item.isActive(location.pathname)
      : href
        ? item.matchExact
          ? location.pathname === href
          : location.pathname.startsWith(href)
        : false;

    const message = isPlanLocked
      ? item.planLockedMessage ?? "Upgrade required to access this section."
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

        {item.id === "projects" && !isMobile && (
          <Badge variant="muted" className="relative z-10 ml-auto text-[10px]">
            Active
          </Badge>
        )}
      </div>
    );

    if (isDisabled) {
      return (
        <button
          key={item.id}
          type="button"
          aria-disabled="true"
          title={message}
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
      <Link key={item.id} to={href} className={baseItemClass}>
        {navContent}
      </Link>
    );
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col md:flex-row bg-background font-sans md:overflow-hidden">
      <aside
        className="hidden md:flex h-[calc(100vh-2rem)] w-72 flex-shrink-0 flex-col overflow-hidden rounded-3xl border-2 border-black bg-card m-4"
        style={{ boxShadow: "4px 4px 0px 0px #1a1a1a" }}
      >
        <div className="border-b border-border/60 p-6">
          <Link to="/projects" className="flex items-center gap-0">
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
              <span className="mt-1 -mb-2 text-xs font-medium text-muted-foreground">Starter</span>
            </div>
          </Link>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-2 overflow-y-auto p-4">
          {navItems.map((item) => renderNavItem(item, false))}
        </nav>

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

      <header className="md:hidden flex items-center justify-between border-b-2 border-black bg-card px-4 py-3">
        <Link to="/projects" className="flex items-center gap-2">
          <img src="/static/donkey.png" alt="Donkey SEO" className="h-10 w-10 object-contain" />
          <div>
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
    </div>
  );
}
