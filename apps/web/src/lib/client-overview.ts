import { SERVICES, type ServiceType, serviceOf } from "./services";
import type { DeliverableRecord, ProjectRecord } from "./types";

/**
 * Everything the client dashboard shows, worked out once from the rows the client can
 * see. Each figure that appears in two places (the strip and a panel) is one value here,
 * so the screen cannot disagree with itself.
 */

export type ReportSummary = {
  platform: "META" | "GOOGLE" | "OTHER";
  periodStart: string;
  periodEnd: string;
  currency: string;
  spend: number | null;
  leads: number | null;
  clicks: number | null;
};

export type DayPlan = {
  date: Date;
  isToday: boolean;
  items: DeliverableRecord[];
};

export type ServiceProgress = {
  project: ProjectRecord;
  service: ServiceType;
  total: number;
  done: number;
  waiting: number;
  doneLabel: string;
};

const DAY = 86_400_000;

function startOfDay(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** When a piece of work goes (or went) out: the planned time, else when it was posted. */
export function goesOutAt(item: DeliverableRecord) {
  const when = item.publishAt ?? item.publishedAt;
  return when ? new Date(when) : null;
}

export function clientOverview(
  projects: ProjectRecord[],
  deliverables: DeliverableRecord[],
  now: Date = new Date(),
) {
  const live = deliverables.filter((item) => item.status !== "ARCHIVED");
  const today = startOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const waiting = live
    .filter((item) => item.status === "UNDER_CLIENT_REVIEW")
    .sort(
      (a, b) =>
        new Date(a.submittedAt ?? a.updatedAt).getTime() -
        new Date(b.submittedAt ?? b.updatedAt).getTime(),
    );

  // The next seven days, today first, each with what is planned to go out on it.
  const days: DayPlan[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() + index * DAY);
    const next = new Date(date.getTime() + DAY);
    const items = live
      .filter((item) => {
        const when = goesOutAt(item);
        return when !== null && when >= date && when < next;
      })
      .sort((a, b) => (goesOutAt(a)?.getTime() ?? 0) - (goesOutAt(b)?.getTime() ?? 0));
    return { date, isToday: index === 0, items };
  });
  const thisWeek = days.flatMap((day) => day.items);
  const nextUp = thisWeek.find((item) => (goesOutAt(item)?.getTime() ?? 0) >= now.getTime());

  const approvedThisMonth = live.filter(
    (item) =>
      (item.status === "APPROVED" || item.status === "DELIVERED") &&
      item.approvedAt !== null &&
      new Date(item.approvedAt) >= monthStart,
  );
  const recentlyApproved = live
    .filter((item) => item.status === "APPROVED" || item.status === "DELIVERED")
    .sort(
      (a, b) =>
        new Date(b.approvedAt ?? b.updatedAt).getTime() -
        new Date(a.approvedAt ?? a.updatedAt).getTime(),
    );
  const beingMade = live.filter((item) =>
    [
      "PENDING",
      "IN_PROGRESS",
      "READY_FOR_INTERNAL_REVIEW",
      "UNDER_INTERNAL_REVIEW",
      "INTERNAL_APPROVED",
      "REVISION_REQUESTED",
    ].includes(item.status),
  );

  // Progress per project the client has work in: how much of it is finished.
  const services: ServiceProgress[] = projects
    .map((project) => {
      const items = live.filter((item) => item.projectId === project.id);
      const service = serviceOf(project.service);
      const definition = SERVICES[service];
      const done = items.filter((item) =>
        definition.publishes
          ? item.publishedAt !== null
          : item.status === "APPROVED" || item.status === "DELIVERED",
      ).length;
      return {
        project,
        service,
        total: items.length,
        done,
        waiting: items.filter((item) => item.status === "UNDER_CLIENT_REVIEW").length,
        doneLabel: definition.publishedLabel.toLowerCase(),
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.waiting - a.waiting || b.total - a.total);

  return {
    waiting,
    days,
    thisWeek,
    nextUp,
    approvedThisMonth,
    recentlyApproved,
    beingMade,
    services,
    hasAds: projects.some((project) => project.service === "ADS"),
  };
}

/**
 * The latest month of ad results, all platforms together. Totals are summed from the
 * same rows the reports page lists, and cost per lead is worked out from those sums.
 */
export function latestAdMonth(reports: ReportSummary[]) {
  if (!reports.length) return null;
  const latest = reports.reduce((a, b) => (a.periodStart > b.periodStart ? a : b));
  const month = latest.periodStart.slice(0, 7);
  const rows = reports.filter((report) => report.periodStart.slice(0, 7) === month);
  const spend = rows.reduce((sum, row) => sum + (row.spend ?? 0), 0);
  const leads = rows.reduce((sum, row) => sum + (row.leads ?? 0), 0);
  return {
    label: new Date(latest.periodStart).toLocaleDateString("en-GB", {
      month: "long",
      timeZone: "UTC",
    }),
    currency: latest.currency,
    spend,
    leads,
    costPerLead: leads ? spend / leads : null,
    platforms: rows.map((row) => row.platform),
  };
}

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("en-IN")}`;
  }
}

/** "today", "yesterday", "3 days ago". */
export function sinceLabel(value: string | null, now: Date = new Date()) {
  if (!value) return "";
  const days = Math.floor(
    (startOfDay(now).getTime() - startOfDay(new Date(value)).getTime()) / DAY,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
