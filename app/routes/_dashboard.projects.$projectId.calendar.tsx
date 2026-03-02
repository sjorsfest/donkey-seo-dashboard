import { useEffect, useMemo, useState } from "react";
import { Link, data, redirect, useLoaderData } from "react-router";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import type { Route } from "./+types/_dashboard.projects.$projectId.calendar";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Drawer } from "~/components/ui/drawer";
import { readApiErrorMessage } from "~/lib/api-error";
import { ApiClient } from "~/lib/api.server";
import { formatDateTime } from "~/lib/dashboard";
import { pickLatestRunForModule, sortPipelineRunsNewest } from "~/lib/pipeline-module";
import { fetchJson } from "~/lib/pipeline-run.server";
import { cn } from "~/lib/utils";
import type { components } from "~/types/api.generated";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];

type CalendarState =
  | "brief_ready"
  | "writer_instructions_ready"
  | "article_ready"
  | "article_needs_review"
  | "published";

type ContentCalendarItem = {
  date: string;
  brief_id: string;
  topic_id: string;
  primary_keyword: string;
  working_title: string | null;
  brief_status: string;
  has_writer_instructions: boolean;
  article_id: string | null;
  article_title: string | null;
  article_slug: string | null;
  article_status: string | null;
  article_current_version: number | null;
  publish_status: string | null;
  published_at: string | null;
  published_url: string | null;
  calendar_state: CalendarState;
};

type ContentCalendarResponse = {
  items: ContentCalendarItem[];
};

type LoaderData = {
  project: ProjectResponse;
  monthKey: string;
  monthLabel: string;
  monthStart: string;
  monthEnd: string;
  items: ContentCalendarItem[];
  latestContentRunId: string | null;
};

type StateCounts = Record<CalendarState, number>;

type CalendarCell = {
  date: Date;
  dateKey: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_STATE_ORDER: CalendarState[] = [
  "published",
  "article_needs_review",
  "article_ready",
  "writer_instructions_ready",
  "brief_ready",
];

const CALENDAR_STATE_META: Record<
  CalendarState,
  { label: string; dotClass: string; chipClass: string; badgeClass: string }
> = {
  published: {
    label: "Published",
    dotClass: "bg-emerald-500",
    chipClass: "bg-emerald-100 text-emerald-800",
    badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-900",
  },
  article_needs_review: {
    label: "Needs review",
    dotClass: "bg-rose-500",
    chipClass: "bg-rose-100 text-rose-800",
    badgeClass: "border-rose-300 bg-rose-100 text-rose-900",
  },
  article_ready: {
    label: "Article ready",
    dotClass: "bg-sky-500",
    chipClass: "bg-sky-100 text-sky-800",
    badgeClass: "border-sky-300 bg-sky-100 text-sky-900",
  },
  writer_instructions_ready: {
    label: "Writer instructions",
    dotClass: "bg-violet-500",
    chipClass: "bg-violet-100 text-violet-800",
    badgeClass: "border-violet-300 bg-violet-100 text-violet-900",
  },
  brief_ready: {
    label: "Brief ready",
    dotClass: "bg-amber-500",
    chipClass: "bg-amber-100 text-amber-800",
    badgeClass: "border-amber-300 bg-amber-100 text-amber-900",
  },
};

function createUtcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseMonthKey(input: string | null) {
  if (!input) return null;
  const match = input.match(MONTH_PATTERN);
  if (!match) return null;

  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
  };
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
}

function monthKeyToStartDate(monthKey: string) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    const fallback = parseMonthKey(currentMonthKey())!;
    return createUtcDate(fallback.year, fallback.month - 1, 1);
  }
  return createUtcDate(parsed.year, parsed.month - 1, 1);
}

function shiftMonthKey(monthKey: string, delta: number) {
  const start = monthKeyToStartDate(monthKey);
  const shifted = createUtcDate(start.getUTCFullYear(), start.getUTCMonth() + delta, 1);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

function parseDateKey(dateKey: string) {
  const match = dateKey.match(DATE_PATTERN);
  if (!match) return null;
  return createUtcDate(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
  );
}

function createEmptyStateCounts(): StateCounts {
  return {
    brief_ready: 0,
    writer_instructions_ready: 0,
    article_ready: 0,
    article_needs_review: 0,
    published: 0,
  };
}

function totalFromCounts(counts: StateCounts) {
  return CALENDAR_STATE_ORDER.reduce((acc, state) => acc + counts[state], 0);
}

function addDays(date: Date, days: number) {
  return createUtcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days);
}

function buildMonthCells(monthStart: Date): CalendarCell[] {
  const monthEnd = createUtcDate(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0);
  const startWeekday = monthStart.getUTCDay();
  const endWeekday = monthEnd.getUTCDay();
  const gridStart = addDays(monthStart, -startWeekday);
  const gridEnd = addDays(monthEnd, 6 - endWeekday);
  const todayKey = toDateKey(new Date());

  const cells: CalendarCell[] = [];
  for (
    let cursor = gridStart;
    cursor.getTime() <= gridEnd.getTime();
    cursor = addDays(cursor, 1)
  ) {
    cells.push({
      date: cursor,
      dateKey: toDateKey(cursor),
      dayOfMonth: cursor.getUTCDate(),
      isCurrentMonth: cursor.getUTCMonth() === monthStart.getUTCMonth(),
      isToday: toDateKey(cursor) === todayKey,
    });
  }
  return cells;
}

async function handleUnauthorized(api: ApiClient) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await api.logout(),
    },
  });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const projectId = params.projectId;
  if (!projectId) {
    throw new Response("Missing project id.", { status: 400 });
  }

  const api = new ApiClient(request);
  const url = new URL(request.url);
  const parsedMonth = parseMonthKey(url.searchParams.get("month"));
  const effectiveMonthKey = parsedMonth
    ? `${parsedMonth.year}-${pad(parsedMonth.month)}`
    : currentMonthKey();
  const monthStartDate = monthKeyToStartDate(effectiveMonthKey);
  const monthEndDate = createUtcDate(monthStartDate.getUTCFullYear(), monthStartDate.getUTCMonth() + 1, 0);
  const monthStart = toDateKey(monthStartDate);
  const monthEnd = toDateKey(monthEndDate);

  const [projectResult, runsResult] = await Promise.all([
    fetchJson<ProjectResponse>(api, `/projects/${projectId}`),
    fetchJson<PipelineRunResponse[]>(api, `/pipeline/${projectId}/runs?limit=20`),
  ]);

  if (projectResult.unauthorized || runsResult.unauthorized) {
    return handleUnauthorized(api);
  }

  if (!projectResult.ok || !projectResult.data) {
    throw new Response("Failed to load project.", { status: projectResult.status });
  }

  const calendarResponse = await api.fetch(
    `/content/${projectId}/calendar?date_from=${encodeURIComponent(monthStart)}&date_to=${encodeURIComponent(monthEnd)}`,
  );

  if (calendarResponse.status === 401) {
    return handleUnauthorized(api);
  }

  if (!calendarResponse.ok) {
    const apiMessage = await readApiErrorMessage(calendarResponse);
    throw new Response(apiMessage ?? "Failed to load scheduled content calendar.", {
      status: calendarResponse.status,
    });
  }

  const calendarPayload = (await calendarResponse.json()) as ContentCalendarResponse;
  const sortedRuns = sortPipelineRunsNewest(runsResult.ok && runsResult.data ? runsResult.data : []);
  const latestContentRun = pickLatestRunForModule(sortedRuns, "content");

  return data(
    {
      project: projectResult.data,
      monthKey: effectiveMonthKey,
      monthLabel: new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(monthStartDate),
      monthStart,
      monthEnd,
      items: calendarPayload.items ?? [],
      latestContentRunId: latestContentRun?.id ?? null,
    } satisfies LoaderData,
    {
      headers: await api.commit(),
    },
  );
}

export default function ProjectCalendarRoute() {
  const { project, monthKey, monthLabel, monthStart, monthEnd, items, latestContentRunId } =
    useLoaderData<typeof loader>() as LoaderData;
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const monthStartDate = useMemo(() => monthKeyToStartDate(monthKey), [monthKey]);
  const prevMonthKey = useMemo(() => shiftMonthKey(monthKey, -1), [monthKey]);
  const nextMonthKey = useMemo(() => shiftMonthKey(monthKey, 1), [monthKey]);
  const todayMonthKey = useMemo(() => currentMonthKey(), []);

  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, ContentCalendarItem[]>();
    for (const item of items) {
      const dateKey = item.date;
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(item);
    }

    for (const [dateKey, dateItems] of grouped) {
      grouped.set(
        dateKey,
        dateItems.slice().sort((a, b) => {
          const orderDiff =
            CALENDAR_STATE_ORDER.indexOf(a.calendar_state) - CALENDAR_STATE_ORDER.indexOf(b.calendar_state);
          if (orderDiff !== 0) return orderDiff;
          return a.primary_keyword.localeCompare(b.primary_keyword);
        }),
      );
    }

    return grouped;
  }, [items]);

  const countsByDate = useMemo(() => {
    const countsMap = new Map<string, StateCounts>();
    for (const item of items) {
      if (!countsMap.has(item.date)) {
        countsMap.set(item.date, createEmptyStateCounts());
      }
      const counts = countsMap.get(item.date)!;
      counts[item.calendar_state] += 1;
    }
    return countsMap;
  }, [items]);

  const monthCounts = useMemo(() => {
    const counts = createEmptyStateCounts();
    for (const item of items) {
      counts[item.calendar_state] += 1;
    }
    return counts;
  }, [items]);

  const monthCells = useMemo(() => buildMonthCells(monthStartDate), [monthStartDate]);
  const selectedDateItems = selectedDateKey ? itemsByDate.get(selectedDateKey) ?? [] : [];
  const selectedDateCounts = selectedDateKey ? countsByDate.get(selectedDateKey) ?? createEmptyStateCounts() : createEmptyStateCounts();
  const selectedDateParsed = selectedDateKey ? parseDateKey(selectedDateKey) : null;
  const selectedDateLabel = selectedDateParsed
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(selectedDateParsed)
    : "Selected day";

  useEffect(() => {
    if (!selectedDateKey) return;
    if (monthCells.some((cell) => cell.dateKey === selectedDateKey && cell.isCurrentMonth)) return;
    setSelectedDateKey(null);
  }, [monthCells, selectedDateKey]);

  const monthTotal = totalFromCounts(monthCounts);
  const monthDaysWithContent = countsByDate.size;
  const monthNeedAttention = monthCounts.article_needs_review;
  const monthPreArticle = monthCounts.writer_instructions_ready + monthCounts.brief_ready;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#f5f8ff] to-[#ecf8f1] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4f5f9d]">Publishing calendar</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Schedule window: {monthStart} to {monthEnd}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/projects/${project.id}/creation`}>
              <Button variant="outline">View content</Button>
            </Link>
            <Link to="/project">
              <Button variant="outline">Back to project</Button>
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4">
          <div className="flex items-center gap-2">
            <Link to={`?month=${prevMonthKey}`}>
              <Button variant="outline" size="sm">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Prev month
              </Button>
            </Link>
            <Link to={`?month=${todayMonthKey}`}>
              <Button variant="secondary" size="sm">Today</Button>
            </Link>
            <Link to={`?month=${nextMonthKey}`}>
              <Button variant="outline" size="sm">
                Next month
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <CalendarDays className="h-4 w-4 text-[#4f5f9d]" />
            {monthLabel}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[#4f5f9d]/30 bg-gradient-to-br from-white to-[#edf2ff]">
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled items</p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-900">{monthTotal}</p>
          </CardContent>
        </Card>
        <Card className="border-[#2f6f71]/30 bg-gradient-to-br from-white to-[#eef8f5]">
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Days with content</p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-900">{monthDaysWithContent}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-300/60 bg-gradient-to-br from-white to-rose-50">
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs review</p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-900">{monthNeedAttention}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-300/60 bg-gradient-to-br from-white to-amber-50">
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pre-article queue</p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-900">{monthPreArticle}</p>
          </CardContent>
        </Card>
      </section>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Monthly schedule overview</CardTitle>
          <CardDescription>
            Click a day to open details and summary statistics for every scheduled content item.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No scheduled content was returned for this month.
            </div>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {CALENDAR_STATE_ORDER.map((state) => (
              <span
                key={state}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                  CALENDAR_STATE_META[state].chipClass,
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", CALENDAR_STATE_META[state].dotClass)} />
                {CALENDAR_STATE_META[state].label}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-7 gap-2">
                {WEEKDAY_LABELS.map((weekday) => (
                  <div
                    key={weekday}
                    className="rounded-lg bg-slate-100 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-2">
                {monthCells.map((cell) => {
                  const counts = countsByDate.get(cell.dateKey);
                  const total = counts ? totalFromCounts(counts) : 0;
                  const activeStates =
                    counts === undefined
                      ? []
                      : CALENDAR_STATE_ORDER.filter((state) => counts[state] > 0);
                  const visibleStates = activeStates.slice(0, 2);
                  const hiddenStateCount = Math.max(0, activeStates.length - visibleStates.length);
                  const isSelected = selectedDateKey === cell.dateKey;

                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      onClick={() => setSelectedDateKey(cell.dateKey)}
                      className={cn(
                        "min-h-[112px] rounded-xl border p-2 text-left transition-all",
                        cell.isCurrentMonth ? "border-slate-200 bg-white hover:border-slate-300" : "border-slate-100 bg-slate-50",
                        isSelected ? "ring-2 ring-[#4f5f9d]/40" : "",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                            cell.isCurrentMonth ? "text-slate-700" : "text-slate-400",
                            cell.isToday ? "bg-[#4f5f9d] text-white" : "",
                          )}
                        >
                          {cell.dayOfMonth}
                        </span>
                        {total > 0 ? (
                          <Badge variant="info" className="text-[10px]">
                            {total}
                          </Badge>
                        ) : null}
                      </div>

                      {total > 0 ? (
                        <div className="mt-2 space-y-1">
                          {visibleStates.map((state) => (
                            <div
                              key={`${cell.dateKey}-${state}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                CALENDAR_STATE_META[state].chipClass,
                              )}
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full", CALENDAR_STATE_META[state].dotClass)} />
                              {counts![state]} {CALENDAR_STATE_META[state].label}
                            </div>
                          ))}
                          {hiddenStateCount > 0 ? (
                            <p className="text-[10px] font-semibold text-slate-500">+{hiddenStateCount} more states</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-3 text-[10px] text-slate-400">No content</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Drawer
        open={selectedDateKey !== null}
        onClose={() => setSelectedDateKey(null)}
        title={`Schedule · ${selectedDateLabel}`}
        description="Summary and item-level status for the selected publication day."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Total scheduled</p>
              <p className="font-display text-2xl font-bold text-slate-900">{selectedDateItems.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase text-emerald-700">Published</p>
              <p className="font-display text-2xl font-bold text-emerald-900">{selectedDateCounts.published}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-semibold uppercase text-rose-700">Needs review</p>
              <p className="font-display text-2xl font-bold text-rose-900">{selectedDateCounts.article_needs_review}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="text-xs font-semibold uppercase text-sky-700">Article ready</p>
              <p className="font-display text-2xl font-bold text-sky-900">{selectedDateCounts.article_ready}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase text-amber-700">Pre-article pipeline</p>
              <p className="font-display text-2xl font-bold text-amber-900">
                {selectedDateCounts.writer_instructions_ready + selectedDateCounts.brief_ready}
              </p>
            </div>
          </div>

          {selectedDateItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">
              No items scheduled for this day.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDateItems.map((item) => {
                const stateMeta = CALENDAR_STATE_META[item.calendar_state];
                const deepLinkToBrief =
                  item.article_id && latestContentRunId
                    ? `/projects/${project.id}/creation/runs/${latestContentRunId}/briefs/${item.brief_id}`
                    : null;

                return (
                  <div key={`${item.brief_id}-${item.date}`} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{item.primary_keyword}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{item.working_title ?? "Working title pending"}</p>
                      </div>
                      <span className={cn("inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold", stateMeta.badgeClass)}>
                        {stateMeta.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="font-semibold text-slate-700">Brief status</p>
                        <p>{item.brief_status}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="font-semibold text-slate-700">Writer instructions</p>
                        <p>{item.has_writer_instructions ? "Ready" : "Not ready"}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="font-semibold text-slate-700">Article status</p>
                        <p>{item.article_status ?? "No article yet"}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="font-semibold text-slate-700">Publish status</p>
                        <p>{item.publish_status ?? "Not published"}</p>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      <p>Brief ID: {item.brief_id}</p>
                      {item.article_id ? <p>Article ID: {item.article_id}</p> : null}
                      {item.published_at ? <p>Published at: {formatDateTime(item.published_at)}</p> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {deepLinkToBrief ? (
                        <Link to={deepLinkToBrief}>
                          <Button variant="outline" size="sm">Open brief detail</Button>
                        </Link>
                      ) : (
                        <Link to={`/projects/${project.id}/creation`}>
                          <Button variant="outline" size="sm">Open content hub</Button>
                        </Link>
                      )}
                      {item.published_url ? (
                        <a
                          href={item.published_url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
                        >
                          Published page
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
