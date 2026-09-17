import { Button, Callout, EmptyState, Skeleton, StatusChip } from "@rexops/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, Film, Image as ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";
import type { ClientRecord, DeliverableRecord, ProjectRecord } from "../../lib/types";

/* A lane is not just a filter: it says whose decision the work is waiting on.
   Each one carries the sentence a new reviewer needs to know which pile is theirs. */
const LANES = [
  {
    key: "INTERNAL",
    label: "Waiting on your team",
    statuses: ["READY_FOR_INTERNAL_REVIEW", "UNDER_INTERNAL_REVIEW"],
    meaning: "Your own team has to look at these before the client ever sees them.",
    emptyTitle: "Nothing needs your team right now",
    emptyBody:
      "Work lands here the moment someone marks a deliverable ready for internal review. Until then there is nothing for your reviewers to do.",
  },
  {
    key: "CLIENT",
    label: "Waiting on the client",
    statuses: ["UNDER_CLIENT_REVIEW"],
    meaning: "Sent out and waiting on someone at the client to approve or send back.",
    emptyTitle: "Nothing is with a client",
    emptyBody:
      "Once your team approves a deliverable internally and sends it on, it appears here until the client decides.",
  },
  {
    key: "CHANGES",
    label: "Sent back for changes",
    statuses: ["REVISION_REQUESTED"],
    meaning: "A reviewer asked for changes. Someone has to make them and upload a new version.",
    emptyTitle: "Nothing has been sent back",
    emptyBody:
      "When a reviewer asks for changes instead of approving, the deliverable lands here with their comments attached.",
  },
] as const;

type LaneKey = (typeof LANES)[number]["key"] | "ALL";

/** How long something has been sitting unanswered, in the words people use. */
function waitingFor(since: string) {
  const started = new Date(since).getTime();
  if (Number.isNaN(started)) return null;
  const days = Math.floor((Date.now() - started) / 86_400_000);
  if (days <= 0) return "Arrived today";
  if (days === 1) return "Waiting 1 day";
  return `Waiting ${days} days`;
}

/** Everything sitting in a review lane, newest submission first. */
export function ReviewQueuePage() {
  const [lane, setLane] = useState<LaneKey>("ALL");

  const deliverables = useQuery({
    queryKey: ["deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => request<ProjectRecord[]>("/api/projects"),
  });
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => request<ClientRecord[]>("/api/clients"),
  });

  const laneStatuses = useMemo(() => {
    const map = new Map<LaneKey, Set<string>>();
    const all = new Set<string>();
    for (const item of LANES) {
      map.set(item.key, new Set(item.statuses));
      for (const status of item.statuses) all.add(status);
    }
    map.set("ALL", all);
    return map;
  }, []);

  const projectName = new Map((projects.data ?? []).map((p) => [p.id, p.name]));
  const clientName = new Map((clients.data ?? []).map((c) => [c.id, c.name]));

  const rows = (deliverables.data ?? [])
    .filter((item) => laneStatuses.get(lane)?.has(item.status))
    .sort((a, b) => (b.submittedAt ?? b.updatedAt).localeCompare(a.submittedAt ?? a.updatedAt));

  const countFor = (key: LaneKey) =>
    (deliverables.data ?? []).filter((item) => laneStatuses.get(key)?.has(item.status)).length;

  return (
    <AgencyShell>
      <PageHeader
        eyebrow="Decisions owed"
        title="Review queue"
        purpose="Every deliverable that is waiting on somebody to approve it or send it back. Nothing moves on its own until a decision is made."
        help={
          <>
            <p>
              Work reaches the client only after your own team approves it internally. The two lanes
              are that handover, in order.
            </p>
            <p>Opening the review room is how a decision is made. The queue itself is read-only.</p>
          </>
        }
      />

      <div className="inbox-tabs" role="tablist" aria-label="Whose decision the work is waiting on">
        <button
          type="button"
          role="tab"
          aria-selected={lane === "ALL"}
          data-active={lane === "ALL"}
          title="Everything awaiting a decision, whoever owes it"
          onClick={() => setLane("ALL")}
        >
          <CheckCircle2 size={15} /> Everything <em>{countFor("ALL")}</em>
        </button>
        {LANES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={lane === item.key}
            data-active={lane === item.key}
            title={item.meaning}
            onClick={() => setLane(item.key)}
          >
            {item.label} <em>{countFor(item.key)}</em>
          </button>
        ))}
      </div>

      <p className="queue-meaning">
        {lane === "ALL"
          ? "Everything below is waiting on a decision from someone. The chip on each card says who."
          : (LANES.find((item) => item.key === lane)?.meaning ?? "")}
      </p>

      {deliverables.isPending ? (
        <section className="panel">
          <Skeleton lines={4} label="Loading the review queue" />
        </section>
      ) : deliverables.isError ? (
        <Callout tone="danger" title="The queue did not load">
          {(deliverables.error as Error).message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => deliverables.refetch()}>
              Try loading the queue again
            </Button>
          </div>
        </Callout>
      ) : !rows.length ? (
        <EmptyState
          icon={<CheckCircle2 size={22} />}
          title={
            lane === "ALL"
              ? "Nothing is waiting on a decision"
              : (LANES.find((item) => item.key === lane)?.emptyTitle ?? "Nothing here")
          }
          body={
            lane === "ALL"
              ? "No deliverable anywhere in the workspace is waiting for someone to approve it or send it back. Work appears here as soon as it is sent for review."
              : (LANES.find((item) => item.key === lane)?.emptyBody ?? "")
          }
          action={
            lane === "ALL" ? (
              <Link className="rx-button rx-button--primary" to="/agency/work">
                See everything in flight
              </Link>
            ) : (
              <Button variant="secondary" onClick={() => setLane("ALL")}>
                Show every lane
              </Button>
            )
          }
        />
      ) : null}

      <section className="project-list">
        {rows.map((item) => (
          <article className="review-card" key={item.id}>
            <div
              className={
                item.contentType === "MOTION" ? "review-thumb" : "review-thumb review-thumb--still"
              }
            >
              {item.contentType === "MOTION" ? <Film size={22} /> : <ImageIcon size={22} />}
            </div>
            <div className="review-card__body">
              <StatusChip status={item.status} />
              <h3>{item.title}</h3>
              <p>
                {projectName.get(item.projectId) ?? "Unassigned project"} for{" "}
                {clientName.get(item.clientId) ?? "an unassigned client"}
              </p>
              <span className="review-card__waiting">
                {waitingFor(item.submittedAt ?? item.updatedAt) ?? "Waiting"}
              </span>
            </div>
            <div className="review-card__actions">
              <Link to="/agency/review/$deliverableId" params={{ deliverableId: item.id }}>
                Review it now
              </Link>
              <Link
                className="review-arrow"
                aria-label={`Open the record for ${item.title} without reviewing`}
                title="Open the deliverable record instead"
                to="/agency/deliverables/$deliverableId"
                params={{ deliverableId: item.id }}
              >
                <ArrowUpRight size={17} />
              </Link>
            </div>
          </article>
        ))}
      </section>

      {rows.length ? (
        <div className="list-footnote">
          <CheckCircle2 size={15} /> {rows.length} deliverable{rows.length === 1 ? "" : "s"} waiting
          on a decision
        </div>
      ) : null}
    </AgencyShell>
  );
}
