import { Button, Callout, EmptyState, HelpTip, Skeleton, StatusChip } from "@rexops/ui";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Film, Inbox } from "lucide-react";
import { ClientShell } from "../../components/app-shell";
import {
  AWAITING_CLIENT,
  formatDate,
  SETTLED,
  useClientWorkspace,
  WITH_AGENCY,
} from "../../lib/client-workspace";
import { titleCase } from "../../lib/format";

/*
 * The client portal's front door. It used to open with "What needs you" and a
 * count, and said nothing about what this place is, who put the work here, or
 * where the rest of it went when the list was empty. A client signs in once a
 * fortnight; they arrive with no memory of the product.
 */
export function ClientHome() {
  const workspace = useClientWorkspace();

  const forReview = workspace.deliverables.filter((item) => AWAITING_CLIENT.has(item.status));
  const approved = workspace.deliverables
    .filter((item) => SETTLED.has(item.status))
    .sort(
      (a, b) =>
        new Date(b.approvedAt ?? b.updatedAt).getTime() -
        new Date(a.approvedAt ?? a.updatedAt).getTime(),
    );
  const inProgress = workspace.deliverables.filter((item) => WITH_AGENCY.has(item.status));

  return (
    <ClientShell>
      <div className="client-heading">
        <span className="rx-eyebrow">Your review portal</span>
        <h1>
          What needs you
          <HelpTip label="What needs you">
            <p>
              This portal is where your agency shares work for sign-off. Anything they send for your
              approval appears here, and stays here until you approve it or ask for changes.
            </p>
            <p>
              Nothing you see here is final until you approve it, and nothing is shared with you
              before your team is happy with it.
            </p>
          </HelpTip>
        </h1>
        <p>
          {forReview.length
            ? `${forReview.length} ${forReview.length === 1 ? "piece of work is" : "pieces of work are"} waiting on your decision. Open one to watch it, comment on it, and approve or ask for changes.`
            : "Nothing is waiting on your decision right now. Your agency will send work here when it is ready for you."}
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

      <section className="client-section">
        <div className="client-section__heading">
          <h2>
            Waiting on your decision{" "}
            <span className="rx-mono">{String(forReview.length).padStart(2, "0")}</span>
          </h2>
          <p>
            Open each one to leave comments pinned to the exact frame or area, then approve it or
            send it back for changes.
          </p>
        </div>
        {workspace.isLoading ? (
          <Skeleton lines={3} label="Loading work that needs your review" />
        ) : forReview.length === 0 ? (
          <EmptyState
            tone="inset"
            icon={<Inbox size={20} />}
            title="Nothing needs your decision"
            body={
              inProgress.length
                ? `Your agency is still working on ${inProgress.length} ${inProgress.length === 1 ? "piece" : "pieces"} of work. It arrives here the moment they send it for your approval.`
                : "When your agency sends work for approval it appears here. You will not need to go looking for it."
            }
            action={
              <Link className="rx-button rx-button--secondary" to="/client/projects">
                See everything your team is working on
              </Link>
            }
          />
        ) : (
          <div className="review-needed-grid">
            {forReview.map((deliverable) => (
              <article className="client-review-card" key={deliverable.id}>
                <div className="client-review-card__media">
                  <Film size={38} />
                </div>
                <div className="client-review-card__copy">
                  <StatusChip status="UNDER_CLIENT_REVIEW" />
                  <h3>{deliverable.title}</h3>
                  <p>{titleCase(deliverable.contentType)}</p>
                  <Link
                    className="rx-button rx-button--primary"
                    to="/client/review/$deliverableId"
                    params={{ deliverableId: deliverable.id }}
                  >
                    Review and decide <ArrowUpRight size={15} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="client-lower-grid">
        <section className="client-section client-section--plain">
          <div className="client-section__heading">
            <h2>Already approved</h2>
            <p>Work you have signed off. The files stay available to download.</p>
          </div>
          <div className="simple-feed">
            {workspace.isLoading ? (
              <Skeleton lines={2} label="Loading approved work" />
            ) : approved.length === 0 ? (
              <EmptyState
                tone="inset"
                title="You have not approved anything yet"
                body="Once you approve a piece of work it moves here, together with the exact files you approved."
              />
            ) : (
              approved.slice(0, 6).map((deliverable) => (
                <article key={deliverable.id}>
                  <span className="approved-icon">
                    <Check size={14} />
                  </span>
                  <div>
                    <strong>{deliverable.title}</strong>
                    <span>{titleCase(deliverable.status)}</span>
                  </div>
                  <time>{formatDate(deliverable.approvedAt ?? deliverable.updatedAt)}</time>
                </article>
              ))
            )}
          </div>
          {approved.length > 6 ? (
            <Link className="rx-action" to="/client/approved">
              See all {approved.length} approved <ArrowUpRight size={14} />
            </Link>
          ) : null}
        </section>
      </div>
    </ClientShell>
  );
}
