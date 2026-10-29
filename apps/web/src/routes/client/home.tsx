import { Button, Callout, Skeleton } from "@rexops/ui";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { ClientShell } from "../../components/app-shell";
import { WorkThumbnail } from "../../components/work-thumb";
import {
  clientOverview,
  goesOutAt,
  latestAdMonth,
  money,
  type ReportSummary,
  sinceLabel,
} from "../../lib/client-overview";
import { contentTypeLabel, useClientWorkspace } from "../../lib/client-workspace";
import { request } from "../../lib/request";
import { SERVICES } from "../../lib/services";
import type { DeliverableRecord } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace";

const time = (value: Date) =>
  value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/*
 * The client's dashboard. A client signs in for a minute, so it answers their two
 * questions in order: is anything waiting for me, and what is going out next? Below
 * that sits the rest of the picture: how each service is going, the latest ad results
 * and what was approved recently.
 */
export function ClientHome() {
  const workspace = useClientWorkspace();
  const me = useWorkspace();
  const overview = useMemo(
    () => clientOverview(workspace.projects, workspace.deliverables),
    [workspace.projects, workspace.deliverables],
  );
  const projectName = (id: string) =>
    workspace.projects.find((project) => project.id === id)?.name ?? "";

  const adProjects = workspace.projects.filter((project) => project.service === "ADS");
  const reports = useQueries({
    queries: adProjects.map((project) => ({
      queryKey: ["ad-reports", project.id],
      queryFn: () => request<ReportSummary[]>(`/api/projects/${project.id}/reports`),
    })),
  });
  const adMonth = latestAdMonth(reports.flatMap((query) => query.data ?? []));

  const clientName = me.data?.client?.name ?? "Your work";
  const agencyName = me.data?.agency?.name ?? "your agency";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const waiting = overview.waiting;
  const oldest = waiting[0];
  const nextUp = overview.nextUp;

  const finding = workspace.isLoading
    ? "Loading your work…"
    : waiting.length
      ? `${waiting.length === 1 ? "One piece of work is" : `${waiting.length} pieces of work are`} waiting for your approval${oldest?.submittedAt ? `, the oldest sent ${sinceLabel(oldest.submittedAt)}` : ""}.`
      : nextUp
        ? `Nothing needs you. Next to go out: ${nextUp.title}, ${goesOutAt(nextUp)?.toLocaleDateString("en-GB", { weekday: "long" })} at ${time(goesOutAt(nextUp) as Date)}.`
        : `Nothing needs you right now. ${agencyName} will let you know when there is.`;

  return (
    <ClientShell>
      <div className="client-heading overview-heading">
        <div>
          <h1>{clientName}</h1>
          <p>
            {today} · {finding}
          </p>
        </div>
        {waiting.length ? (
          <Link
            className="rx-button rx-button--primary"
            to="/client/review/$deliverableId"
            params={{ deliverableId: (oldest as DeliverableRecord).id }}
          >
            Review {waiting.length === 1 ? "it" : `the oldest of ${waiting.length}`}{" "}
            <ArrowRight size={15} />
          </Link>
        ) : null}
      </div>

      {workspace.error ? (
        <Callout tone="danger" title="Your work did not load">
          {workspace.error.message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={workspace.refetch}>
              Try again
            </Button>
          </div>
        </Callout>
      ) : null}

      {/* The four answers, one divided strip. */}
      <section className="overview-strip" aria-label="At a glance">
        <div>
          <span>Waiting for you</span>
          <strong data-signal={waiting.length > 0 || undefined}>{waiting.length}</strong>
          <small>
            {oldest?.submittedAt
              ? `Oldest sent ${sinceLabel(oldest.submittedAt)}`
              : "Nothing waiting"}
          </small>
        </div>
        <div>
          <span>Going out in the next 7 days</span>
          <strong>{overview.thisWeek.length}</strong>
          <small>
            {nextUp
              ? `Next: ${goesOutAt(nextUp)?.toLocaleDateString("en-GB", { weekday: "short" })} ${time(goesOutAt(nextUp) as Date)}`
              : "Nothing scheduled"}
          </small>
        </div>
        <div>
          <span>Approved this month</span>
          <strong>{overview.approvedThisMonth.length}</strong>
          <small>{overview.beingMade.length} more being made now</small>
        </div>
        {overview.hasAds ? (
          <div>
            <span>Ad leads{adMonth ? ` in ${adMonth.label}` : ""}</span>
            <strong>{adMonth ? adMonth.leads.toLocaleString("en-IN") : "—"}</strong>
            <small>
              {adMonth
                ? `${money(adMonth.spend, adMonth.currency)} spent${adMonth.costPerLead ? ` · ${money(adMonth.costPerLead, adMonth.currency)} a lead` : ""}`
                : "First report after a month of ads"}
            </small>
          </div>
        ) : (
          <div>
            <span>Being made</span>
            <strong>{overview.beingMade.length}</strong>
            <small>With {agencyName} now</small>
          </div>
        )}
      </section>

      <div className="overview-grid">
        <div className="overview-main">
          <section className="overview-panel" aria-labelledby="waiting-title">
            <header>
              <h2 id="waiting-title">Waiting for you</h2>
              {waiting.length > 4 ? (
                <Link to="/client/review">View all {waiting.length}</Link>
              ) : null}
            </header>
            {workspace.isLoading ? (
              <Skeleton lines={3} label="Loading" />
            ) : waiting.length ? (
              <ul className="waiting-list">
                {waiting.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <Link to="/client/review/$deliverableId" params={{ deliverableId: item.id }}>
                      <WorkThumbnail item={item} />
                      <span className="waiting-list__text">
                        <strong>{item.title}</strong>
                        <span>
                          {contentTypeLabel(item.contentType)} · {projectName(item.projectId)}
                          {item.submittedAt ? ` · sent ${sinceLabel(item.submittedAt)}` : ""}
                        </span>
                      </span>
                      <span className="waiting-list__action">
                        Review <ArrowRight size={14} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="overview-empty">
                Nothing is waiting for you.{" "}
                {overview.beingMade.length
                  ? `${agencyName} is making ${overview.beingMade.length} ${overview.beingMade.length === 1 ? "piece" : "pieces"} of work for you; ${overview.beingMade.length === 1 ? "it" : "each"} will show up here when it's ready.`
                  : ""}
              </p>
            )}
          </section>

          {/* The posting plan: the next seven days, each post on its day. */}
          <section className="overview-panel" aria-labelledby="week-title">
            <header>
              <h2 id="week-title">The next 7 days</h2>
              <Link to="/client/calendar">Full calendar</Link>
            </header>
            <ol className="week-strip">
              {overview.days.map((day) => (
                <li key={day.date.toISOString()} data-today={day.isToday || undefined}>
                  <span className="week-strip__day">
                    {day.isToday
                      ? "Today"
                      : day.date.toLocaleDateString("en-GB", { weekday: "short" })}{" "}
                    <b>{day.date.getDate()}</b>
                  </span>
                  {day.items.length ? (
                    day.items.map((item) => (
                      <Link
                        key={item.id}
                        className="week-strip__post"
                        to="/client/review/$deliverableId"
                        params={{ deliverableId: item.id }}
                        data-done={item.publishedAt ? true : undefined}
                      >
                        <WorkThumbnail item={item} />
                        <span className="week-strip__time">
                          {time(goesOutAt(item) as Date)}
                          {item.publishedAt ? " · posted" : ""}
                        </span>
                        <span className="week-strip__title">{item.title}</span>
                        {item.platforms.length ? (
                          <span className="week-strip__where">{item.platforms.join(", ")}</span>
                        ) : null}
                      </Link>
                    ))
                  ) : (
                    <span className="week-strip__none">—</span>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="overview-panel" aria-labelledby="approved-title">
            <header>
              <h2 id="approved-title">Recently approved</h2>
              <Link to="/client/approved">Approved work and downloads</Link>
            </header>
            <div>
              {overview.recentlyApproved.length ? (
                <ul className="approved-list">
                  {overview.recentlyApproved.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <time>
                        {new Date(item.approvedAt ?? item.updatedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="overview-empty">Anything you approve shows up here.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="overview-rail">
          <section aria-labelledby="services-title">
            <h2 id="services-title">Your projects</h2>
            <div className="overview-panel overview-panel--tight">
              {overview.services.length ? (
                <ul className="service-progress">
                  {overview.services.map((row) => (
                    <li key={row.project.id}>
                      <div>
                        <strong>{row.project.name}</strong>
                        <span>
                          {row.done} of {row.total} {row.doneLabel}
                        </span>
                      </div>
                      <span className="service-progress__kind">
                        {SERVICES[row.service].label}
                        {row.waiting ? ` · ${row.waiting} waiting for you` : ""}
                      </span>
                      <span className="service-progress__track" aria-hidden="true">
                        <i style={{ width: `${(row.done / row.total) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="overview-empty">Projects appear here once work starts.</p>
              )}
            </div>
          </section>

          {overview.hasAds ? (
            <section aria-labelledby="ads-title">
              <h2 id="ads-title">Ad results{adMonth ? `, ${adMonth.label}` : ""}</h2>
              <div className="overview-panel overview-panel--tight">
                {adMonth ? (
                  <>
                    <dl className="ad-glance">
                      <div>
                        <dt>Spent</dt>
                        <dd>{money(adMonth.spend, adMonth.currency)}</dd>
                      </div>
                      <div>
                        <dt>Leads</dt>
                        <dd>{adMonth.leads.toLocaleString("en-IN")}</dd>
                      </div>
                      <div>
                        <dt>Cost per lead</dt>
                        <dd>
                          {adMonth.costPerLead ? money(adMonth.costPerLead, adMonth.currency) : "—"}
                        </dd>
                      </div>
                    </dl>
                    <Link className="overview-link" to="/client/reports">
                      Full reports <ArrowRight size={14} />
                    </Link>
                  </>
                ) : (
                  <p className="overview-empty">
                    Your first report appears here after a month of ads.
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </ClientShell>
  );
}
