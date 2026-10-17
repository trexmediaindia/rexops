import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { SERVICES, type ServiceType, serviceOf, stepLabel } from "../lib/services";
import type { DeliverableRecord, ProjectRecord } from "../lib/types";

export type CalendarEntry = {
  item: DeliverableRecord;
  project: ProjectRecord | undefined;
  service: ServiceType;
  date: Date;
  /** "post" = a planned post/go-live time; "due" = a due date. */
  kind: "post" | "due";
};

/** The client doesn't see the agency's internal steps, only where it stands for them. */
function clientStep(entry: CalendarEntry) {
  const { item, service } = entry;
  if (item.publishedAt) return SERVICES[service].publishedLabel;
  if (item.status === "UNDER_CLIENT_REVIEW") return "Waiting for you";
  if (item.status === "APPROVED" || item.status === "DELIVERED")
    return service === "ADS" ? "Approved · ready to launch" : "Approved · scheduled";
  return "Planned";
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Everything with a date: post / go-live time for social and ads, due date otherwise. */
export function calendarEntries(
  deliverables: DeliverableRecord[],
  projects: ProjectRecord[],
): CalendarEntry[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const entries: CalendarEntry[] = [];
  for (const item of deliverables) {
    if (item.status === "ARCHIVED") continue;
    const project = byId.get(item.projectId);
    const service = serviceOf(project?.service);
    const when = item.publishAt ?? item.publishedAt;
    if (when) entries.push({ item, project, service, date: new Date(when), kind: "post" });
    else if (item.dueDate)
      entries.push({ item, project, service, date: new Date(item.dueDate), kind: "due" });
  }
  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * A month grid. Each piece of work sits on its post / go-live date (or its due date),
 * coloured by service, with its step written underneath. On phones it collapses to a
 * list of the days that have something on them.
 */
export function CalendarMonth({
  entries,
  linkFor,
  clientNames,
}: {
  entries: CalendarEntry[];
  linkFor: "agency" | "client";
  clientNames?: Map<string, string>;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const todayKey = dayKey(new Date());

  const days = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const cells = Math.ceil((offset + last.getDate()) / 7) * 7;
    return Array.from({ length: cells }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const key = dayKey(entry.date);
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [entries]);

  const inMonth = entries.filter(
    (entry) =>
      entry.date.getMonth() === cursor.getMonth() &&
      entry.date.getFullYear() === cursor.getFullYear(),
  );

  const move = (delta: number) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  const chip = (entry: CalendarEntry) => {
    const time =
      entry.kind === "post"
        ? entry.date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "Due";
    const client = entry.project ? clientNames?.get(entry.project.clientId) : undefined;
    const body = (
      <>
        <span className="cal-chip__time">{time}</span>
        <span className="cal-chip__title">{entry.item.title}</span>
        <span className="cal-chip__meta">
          {linkFor === "client" ? clientStep(entry) : stepLabel(entry.service, entry.item)}
          {client ? ` · ${client}` : ""}
          {entry.item.platforms?.length ? ` · ${entry.item.platforms.join(", ")}` : ""}
        </span>
      </>
    );
    return linkFor === "agency" ? (
      <Link
        key={entry.item.id}
        className="cal-chip"
        data-service={entry.service}
        data-done={!!entry.item.publishedAt || undefined}
        to="/agency/deliverables/$deliverableId"
        params={{ deliverableId: entry.item.id }}
      >
        {body}
      </Link>
    ) : (
      <Link
        key={entry.item.id}
        className="cal-chip"
        data-service={entry.service}
        data-done={!!entry.item.publishedAt || undefined}
        to="/client/review/$deliverableId"
        params={{ deliverableId: entry.item.id }}
      >
        {body}
      </Link>
    );
  };

  return (
    <section className="calendar panel">
      <header className="calendar__head">
        <button
          type="button"
          className="icon-button"
          aria-label="Previous month"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <h2>{cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Next month"
          onClick={() => move(1)}
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="calendar__today"
          onClick={() => {
            const now = new Date();
            setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
        >
          Today
        </button>
        <ul className="calendar__legend" aria-label="Colours">
          {(["SOCIAL_MEDIA", "CREATIVES", "ADS"] as const).map((service) => (
            <li key={service} data-service={service}>
              {SERVICES[service].label.replace(" management", "").replace(" delivery", "")}
            </li>
          ))}
        </ul>
      </header>

      <div className="calendar__grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar__weekday">
            {day}
          </div>
        ))}
        {days.map((date) => {
          const key = dayKey(date);
          const items = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className="calendar__day"
              data-outside={date.getMonth() !== cursor.getMonth() || undefined}
              data-today={key === todayKey || undefined}
            >
              <span className="calendar__date">{date.getDate()}</span>
              {items.map(chip)}
            </div>
          );
        })}
      </div>

      {/* Phones: the grid is too small to read, so list the days that have something. */}
      <ol className="calendar__list">
        {inMonth.length ? (
          [...new Set(inMonth.map((entry) => dayKey(entry.date)))].map((key) => {
            const items = byDay.get(key) ?? [];
            const date = items[0]?.date ?? new Date();
            return (
              <li key={key} data-today={key === todayKey || undefined}>
                <strong>
                  {date.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </strong>
                {items.map(chip)}
              </li>
            );
          })
        ) : (
          <li className="calendar__empty">Nothing planned this month.</li>
        )}
      </ol>
    </section>
  );
}
