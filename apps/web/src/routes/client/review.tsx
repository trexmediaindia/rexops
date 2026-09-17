import { Button, Callout, EmptyState, HelpTip, Skeleton, StatusChip } from "@rexops/ui";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Clock3, Film, Image, Layers } from "lucide-react";
import { ClientShell } from "../../components/app-shell";
import {
  AWAITING_CLIENT,
  daysUntil,
  formatDate,
  SETTLED,
  useClientWorkspace,
  WITH_AGENCY,
} from "../../lib/client-workspace";
import { titleCase } from "../../lib/format";
import type { DeliverableRecord } from "../../lib/types";

/*
 * This screen and the portal's front door both listed "cuts waiting on you", so
 * two of the four nav items led to the same list and neither said how it
 * differed from the other. This one is now the complete list — every piece of
 * work shared with the client, whatever stage it is at — and the front door
 * keeps the narrower job of "decide these now".
 */
export function ClientReview() {
  const workspace = useClientWorkspace();
  const waiting = workspace.deliverables.filter((item) => AWAITING_CLIENT.has(item.status));
  const inFlight = workspace.deliverables.filter((item) => WITH_AGENCY.has(item.status));
  const approved = workspace.deliverables.filter((item) => SETTLED.has(item.status));
  const projectName = (id: string) =>
    workspace.projects.find((project) => project.id === id)?.name ?? "Project";

  return (
    <ClientShell>
      <div className="client-heading">
        <span className="rx-eyebrow">Everything in one list</span>
        <h1>
          All work
          <HelpTip label="All work">
            <p>
              Every piece of work your agency has shared with you, whatever stage it is at, in one
              flat list. Use it when you know what you are looking for but not which project it sits
              under.
            </p>
            <p>
              Work only appears here once your agency shares it. Anything they are still planning
              stays out of sight until then.
            </p>
          </HelpTip>
        </h1>
        <p>
          {waiting.length
            ? `${waiting.length} ${waiting.length === 1 ? "piece of work is" : "pieces of work are"} waiting on your decision. The rest is listed underneath so you can see where everything stands.`
            : "Nothing is waiting on your decision. Everything shared with you is listed below, with what is happening to it."}
        </p>
      </div>

      {workspace.error ? (
        <Callout tone="danger" title="Your work did not load">
          {workspace.error.message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={workspace.refetch}>
              Try loading it again
            </Button>
          </div>
        </Callout>
      ) : null}

      {workspace.isLoading ? (
        <Skeleton lines={4} label="Loading everything shared with you" />
      ) : null}

      {!workspace.isLoading && !workspace.error && !workspace.deliverables.length ? (
        <EmptyState
          icon={<Layers size={22} />}
          title="Nothing has been shared with you yet"
          body="This fills up as your agency shares work. You will get an email when the first piece is ready for you, so there is nothing to watch for here."
          action={
            <Link className="rx-button rx-button--secondary" to="/client/projects">
              See the projects your agency has set up
            </Link>
          }
        />
      ) : null}

      {waiting.length ? (
        <section className="client-section">
          <div className="client-section__heading">
            <h2>
              Waiting on your decision{" "}
              <span className="rx-mono">{String(waiting.length).padStart(2, "0")}</span>
            </h2>
            <p>
              Open one to comment on the exact frame or area, then approve it or ask for changes.
            </p>
          </div>
          <div className="review-needed-grid">
            {waiting.map((deliverable) => (
              <ReviewCard
                key={deliverable.id}
                deliverable={deliverable}
                projectName={projectName(deliverable.projectId)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {inFlight.length ? (
        <section className="client-section client-section--plain">
          <div className="client-section__heading">
            <h2>
              With your agency{" "}
              <span className="rx-mono">{String(inFlight.length).padStart(2, "0")}</span>
            </h2>
            <p>
              Being made or reviewed internally. Nothing is needed from you until it reaches the
              section above.
            </p>
          </div>
          <div className="simple-feed">
            {inFlight.map((deliverable) => (
              <article key={deliverable.id}>
                <span className="approved-icon approved-icon--pending">
                  <Clock3 size={14} />
                </span>
                <div>
                  <strong>{deliverable.title}</strong>
                  <span>{projectName(deliverable.projectId)}</span>
                </div>
                <StatusChip status={deliverable.status} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {approved.length ? (
        <section className="client-section client-section--plain">
          <div className="client-section__heading">
            <h2>
              Already approved{" "}
              <span className="rx-mono">{String(approved.length).padStart(2, "0")}</span>
            </h2>
            <p>Signed off by you. The files you approved stay available to download.</p>
          </div>
          <div className="simple-feed">
            {approved.slice(0, 5).map((deliverable) => (
              <article key={deliverable.id}>
                <span className="approved-icon">
                  <Check size={14} />
                </span>
                <div>
                  <strong>{deliverable.title}</strong>
                  <span>{projectName(deliverable.projectId)}</span>
                </div>
                <time>{formatDate(deliverable.approvedAt ?? deliverable.updatedAt)}</time>
              </article>
            ))}
          </div>
          <Link className="rx-action" to="/client/approved">
            {approved.length > 5
              ? `See all ${approved.length} approved, with their files`
              : "See the approved work with its files"}{" "}
            <ArrowUpRight size={14} />
          </Link>
        </section>
      ) : null}
    </ClientShell>
  );
}

function ReviewCard({
  deliverable,
  projectName,
}: {
  deliverable: DeliverableRecord;
  projectName: string;
}) {
  const remaining = daysUntil(deliverable.dueDate);

  return (
    <article className="client-review-card">
      <div className="client-review-card__media">
        {deliverable.contentType === "STATIC" ? <Image size={38} /> : <Film size={38} />}
      </div>
      <div className="client-review-card__copy">
        <StatusChip status={deliverable.status} />
        <h3>{deliverable.title}</h3>
        <p>
          {projectName} · {titleCase(deliverable.contentType)}
        </p>
        {deliverable.clientNote ? (
          <blockquote className="client-review-card__note">{deliverable.clientNote}</blockquote>
        ) : null}
        <span className="client-review-card__due">
          {deliverable.dueDate
            ? remaining !== null && remaining < 0
              ? `A decision was wanted by ${formatDate(deliverable.dueDate)} — that date has passed`
              : `A decision is wanted by ${formatDate(deliverable.dueDate)}`
            : `Shared with you on ${formatDate(deliverable.submittedAt ?? deliverable.updatedAt)}`}
        </span>
        <Link
          className="rx-button rx-button--primary"
          to="/client/review/$deliverableId"
          params={{ deliverableId: deliverable.id }}
        >
          Review and decide <ArrowUpRight size={15} />
        </Link>
      </div>
    </article>
  );
}
