import { Callout, EmptyState, HelpTip, MetricCard, Skeleton, StatusChip } from "@rexops/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock3, Film, Image as ImageIcon, Plus } from "lucide-react";
import { ActivityFeed, type ActivityRow } from "../../components/activity/activity-feed";
import { AgencyShell } from "../../components/app-shell";
import { SetupGuide } from "../../components/onboarding/setup-guide";
import { useFeatures } from "../../lib/features";
import { request } from "../../lib/request";
import type { DeliverableRecord } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace";

/** Deliverables that are sitting on somebody's desk waiting for a decision. */
const REVIEW_STATUSES = new Set([
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "UNDER_CLIENT_REVIEW",
  "REVISION_REQUESTED",
]);

function dueLabel(dueDate: string | null) {
  if (!dueDate) return "no due date";
  const days = Math.round((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days}d`;
}

type Overview = {
  metrics: {
    active: number;
    waitingOnClient: number;
    revisionRounds: number;
    averageTurnaroundHours: number;
    onTimePercent: number;
    overdue: number;
  };
  portfolio: Array<{ name: string; active: number; waitingOnClient: number; health: string }>;
};

export function AgencyDashboard() {
  const features = useFeatures();
  const workspace = useWorkspace();

  /*
   * These used to be bare `fetch` calls against a hardcoded origin, so a failed
   * request rendered as permanent em-dashes with nothing saying why. `request`
   * throws a `RequestError` carrying the status, which is what lets the panels
   * below tell "still loading" apart from "your session expired".
   */
  const analytics = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => request<Overview>("/api/analytics/overview"),
    enabled: features.data?.analytics === true,
    retry: false,
  });
  const activity = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => request<{ items: ActivityRow[] }>("/api/collaboration/activity/recent?limit=8"),
    enabled: features.data?.["collaboration.live"] === true,
    retry: false,
  });
  const reviewQueue = useQuery({
    queryKey: ["deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () =>
      request<{ id: string; name: string; clientId: string; status: string }[]>("/api/projects"),
  });
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => request<{ id: string; name: string }[]>("/api/clients"),
  });

  const queue = (reviewQueue.data ?? []).filter((item) => REVIEW_STATUSES.has(item.status));
  const projectName = new Map((projects.data ?? []).map((project) => [project.id, project.name]));
  // The portfolio table is keyed by client name, so count live projects the same way.
  const clientById = new Map((clients.data ?? []).map((client) => [client.id, client.name]));
  const activeProjectsByClient = new Map<string, number>();
  for (const project of projects.data ?? []) {
    if (["COMPLETED", "ARCHIVED"].includes(project.status)) continue;
    const name = clientById.get(project.clientId);
    if (!name) continue;
    activeProjectsByClient.set(name, (activeProjectsByClient.get(name) ?? 0) + 1);
  }

  const metrics = analytics.data?.metrics;
  const firstName = (workspace.data?.user.name ?? "").split(" ")[0] ?? "";
  const now = new Date();
  const today = now
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .replace(",", " /");
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  const nothingYet = !reviewQueue.isPending && !clients.isPending && !(clients.data ?? []).length;

  return (
    <AgencyShell>
      <div className="screen-heading">
        <div className="page-header__text">
          <span className="rx-eyebrow">{today}</span>
          <h1>
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p>
            {reviewQueue.isPending
              ? "Checking what needs a decision…"
              : queue.length
                ? `${queue.length} deliverable${queue.length === 1 ? "" : "s"} need a decision before the client sees them. Start at the review queue.`
                : nothingYet
                  ? "This workspace is empty. The guide below walks you through the first piece of work."
                  : "Nothing is waiting on a decision right now. This is where anything that needs you will appear."}
          </p>
        </div>
        <div className="page-header__actions">
          <Link className="rx-button rx-button--primary" to="/agency/work" search={{ new: "1" }}>
            <Plus size={15} /> Add a deliverable
          </Link>
        </div>
      </div>

      <SetupGuide />

      {features.data?.analytics ? (
        analytics.isError ? (
          <Callout tone="warning" title="The numbers did not load">
            {(analytics.error as Error).message} The lists below still work — only the summary at
            the top is missing.
          </Callout>
        ) : (
          <section className="metric-grid" aria-label="How this workspace is doing">
            <MetricCard
              label="Active work"
              value={metrics?.active ?? "—"}
              note="Deliverables not yet approved"
              help="Every deliverable in this workspace that has not reached Approved, Delivered or Archived."
              tone="violet"
            />
            <MetricCard
              label="Waiting on the client"
              value={metrics?.waitingOnClient ?? "—"}
              note="Sent out, no decision yet"
              help="Deliverables you have sent for client review. Nothing on your side moves until they approve or request changes."
              tone="teal"
            />
            <MetricCard
              label="Revision rounds"
              value={metrics?.revisionRounds ?? "—"}
              note="Times changes were asked for"
              help="How many times a reviewer has sent work back for changes. A rising number usually means briefs need tightening."
              tone="orange"
            />
            <MetricCard
              label="Average turnaround"
              value={metrics ? `${metrics.averageTurnaroundHours}h` : "—"}
              note="Sent for review to approved"
              help="Average hours between a deliverable entering review and being approved, across everything approved so far."
              tone="green"
            />
            <MetricCard
              label="Delivered on time"
              value={metrics ? `${metrics.onTimePercent}%` : "—"}
              note={`${metrics?.overdue ?? 0} past its due date now`}
              help="Share of approved deliverables approved on or before their due date. Deliverables with no due date are not counted."
              tone="blue"
            />
          </section>
        )
      ) : null}

      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel__heading">
            <div>
              <span className="rx-eyebrow">Latest first</span>
              <h2>
                What has happened
                <HelpTip label="What has happened">
                  <p>
                    Uploads, comments, status changes and approvals from everyone in this workspace,
                    including your clients.
                  </p>
                </HelpTip>
              </h2>
            </div>
            <Link to="/agency/inbox">
              See everything <ArrowUpRight size={14} />
            </Link>
          </div>
          {!features.data?.["collaboration.live"] ? (
            <EmptyState
              tone="inset"
              title="Activity is switched off"
              body="This workspace does not have live collaboration enabled, so there is no activity feed to show."
            />
          ) : activity.isPending ? (
            <Skeleton lines={4} label="Loading recent activity" />
          ) : activity.isError ? (
            <EmptyState
              tone="inset"
              title="Activity did not load"
              body={`${(activity.error as Error).message} Your session may have expired.`}
              action={
                <button
                  type="button"
                  className="rx-button rx-button--secondary"
                  onClick={() => activity.refetch()}
                >
                  Try again
                </button>
              }
            />
          ) : !activity.data?.items.length ? (
            <EmptyState
              tone="inset"
              title="Nothing has happened yet"
              body="Uploads, comments and approvals show up here as your team and your clients work. Upload a file to a deliverable to see the first entry."
              action={
                <Link className="rx-button rx-button--secondary" to="/agency/work">
                  Open the work board
                </Link>
              }
            />
          ) : (
            <ActivityFeed rows={activity.data.items} compact />
          )}
        </section>

        <section className="panel review-panel">
          <div className="panel__heading">
            <div>
              <span className="rx-eyebrow">Needs a decision</span>
              <h2>
                Waiting on review
                <HelpTip label="Waiting on review">
                  <p>
                    A deliverable lands here once it has been sent for review and nobody has
                    approved it or asked for changes yet.
                  </p>
                  <p>Open one to watch or read it, leave comments, and record your decision.</p>
                </HelpTip>
              </h2>
            </div>
            <Link
              className="queue-count rx-mono"
              to="/agency/review"
              aria-label="Open the review queue"
            >
              {String(queue.length).padStart(2, "0")}
            </Link>
          </div>
          {reviewQueue.isPending ? (
            <Skeleton lines={3} label="Loading the review queue" />
          ) : reviewQueue.isError ? (
            <EmptyState
              tone="inset"
              title="The queue did not load"
              body={`${(reviewQueue.error as Error).message} Nothing has been lost — this is a read.`}
              action={
                <button
                  type="button"
                  className="rx-button rx-button--secondary"
                  onClick={() => reviewQueue.refetch()}
                >
                  Try again
                </button>
              }
            />
          ) : !queue.length ? (
            <EmptyState
              tone="inset"
              title="Nothing is waiting on a decision"
              body="When someone sends a deliverable for internal or client review, it appears here with its due date."
              action={
                <Link className="rx-button rx-button--secondary" to="/agency/work">
                  See all work
                </Link>
              }
            />
          ) : (
            queue.slice(0, 4).map((item) => (
              <article className="review-card review-card--compact" key={item.id}>
                <div
                  className={
                    item.contentType === "MOTION"
                      ? "review-thumb"
                      : "review-thumb review-thumb--still"
                  }
                >
                  {item.contentType === "MOTION" ? <Film size={22} /> : <ImageIcon size={22} />}
                </div>
                <div className="review-card__body">
                  <StatusChip status={item.status} />
                  <h3>{item.title}</h3>
                  <p>{projectName.get(item.projectId) ?? "Unassigned project"}</p>
                  <div>
                    <span>
                      <Clock3 size={13} /> {dueLabel(item.dueDate)}
                    </span>
                  </div>
                </div>
                <Link
                  className="review-arrow"
                  aria-label={`Open ${item.title}`}
                  to="/agency/deliverables/$deliverableId"
                  params={{ deliverableId: item.id }}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </article>
            ))
          )}
        </section>
      </div>

      {features.data?.analytics && !analytics.isError ? (
        <section className="panel client-rollup">
          <div className="panel__heading">
            <div>
              <span className="rx-eyebrow">One row per client</span>
              <h2>
                How each client is doing
                <HelpTip label="How each client is doing">
                  <p>
                    <strong>In production</strong> is work your team still has.{" "}
                    <strong>Waiting</strong> is work sitting with the client.
                  </p>
                  <p>
                    Health is worked out from overdue items and how long the client has been sitting
                    on a decision.
                  </p>
                </HelpTip>
              </h2>
            </div>
            <Link to="/agency/clients">
              Open clients <ArrowUpRight size={14} />
            </Link>
          </div>
          {analytics.isPending ? (
            <Skeleton lines={4} label="Loading the client roll-up" />
          ) : !(analytics.data?.portfolio ?? []).length ? (
            <EmptyState
              tone="inset"
              title="No clients to summarise yet"
              body="Add the company you work for, then start a project for them. This table fills in as work moves."
              action={
                <Link
                  className="rx-button rx-button--primary"
                  to="/agency/clients"
                  search={{ new: "1" }}
                >
                  Add your first client
                </Link>
              }
            />
          ) : (
            <table className="data-table" aria-label="How each client is doing">
              <thead>
                <tr className="data-table__head">
                  <th scope="col">Client</th>
                  <th scope="col">Active projects</th>
                  <th scope="col">In production</th>
                  <th scope="col">Waiting on them</th>
                  <th scope="col">Health</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.data?.portfolio ?? []).map((row) => (
                  <tr className="data-table__row" key={row.name}>
                    <th scope="row">{row.name}</th>
                    <td className="rx-mono">{activeProjectsByClient.get(row.name) ?? 0}</td>
                    <td className="rx-mono">{row.active}</td>
                    <td className="rx-mono">{row.waitingOnClient}</td>
                    <td>
                      <StatusChip status={row.health} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </AgencyShell>
  );
}
