import { Button, Callout, EmptyState, Skeleton, StatusChip } from "@rexops/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, FileText, Film, Image as ImageIcon, Inbox } from "lucide-react";
import { ClientShell } from "../../components/app-shell";
import {
  AWAITING_CLIENT,
  clientStatusLabel,
  contentTypeLabel,
  formatDate,
  SETTLED,
  useClientWorkspace,
  WITH_AGENCY,
} from "../../lib/client-workspace";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include" });
  return response.ok ? ((await response.json()) as T) : null;
}

/** A real picture of the work: the image itself, or a video's poster frame. */
function WorkThumbnail({
  deliverableId,
  contentType,
}: {
  deliverableId: string;
  contentType: string;
}) {
  const thumb = useQuery({
    queryKey: ["client-thumb", deliverableId],
    queryFn: async () => {
      const versions = await getJson<Array<{ id: string; fileType: string | null }>>(
        `/api/file-versions/deliverable/${deliverableId}`,
      );
      const latest = versions?.[0];
      if (!latest) return null;
      const kind = latest.fileType?.startsWith("image/") ? "preview" : "poster";
      return (
        (await getJson<{ url: string }>(`/api/file-versions/${latest.id}/${kind}`))?.url ?? null
      );
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (thumb.data) return <img src={thumb.data} alt="" loading="lazy" />;
  const Icon = contentType === "MOTION" ? Film : contentType === "STATIC" ? ImageIcon : FileText;
  return <Icon size={38} aria-hidden="true" />;
}

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
        <h1>{forReview.length ? "Ready for your review" : "You're all caught up"}</h1>
        <p>
          {forReview.length
            ? `${forReview.length === 1 ? "One thing is" : `${forReview.length} things are`} waiting for you. Open it, have a look, then approve it or tell us what to change.`
            : "Nothing needs you right now. New work will appear here as soon as it's ready."}
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
        {workspace.isLoading ? (
          <Skeleton lines={3} label="Loading work that needs your review" />
        ) : forReview.length === 0 ? (
          <EmptyState
            tone="inset"
            icon={<Inbox size={20} />}
            title="Nothing to review"
            body={
              inProgress.length
                ? `We're working on ${inProgress.length} ${inProgress.length === 1 ? "thing" : "things"} for you. ${inProgress.length === 1 ? "It" : "They"}'ll show up here when ready.`
                : "When there's something to look at, it will show up here."
            }
          />
        ) : (
          <div className="review-needed-grid">
            {forReview.map((deliverable) => (
              <Link
                className="client-review-card"
                key={deliverable.id}
                to="/client/review/$deliverableId"
                params={{ deliverableId: deliverable.id }}
              >
                <div className="client-review-card__media">
                  <WorkThumbnail
                    deliverableId={deliverable.id}
                    contentType={deliverable.contentType}
                  />
                </div>
                <div className="client-review-card__copy">
                  <StatusChip
                    status="UNDER_CLIENT_REVIEW"
                    label={clientStatusLabel("UNDER_CLIENT_REVIEW")}
                  />
                  <h3>{deliverable.title}</h3>
                  <p>{contentTypeLabel(deliverable.contentType)}</p>
                  <span className="rx-button rx-button--primary">
                    Open and review <ArrowRight size={15} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="client-lower-grid">
        <section className="client-section client-section--plain">
          <div className="client-section__heading">
            <h2>Recently approved</h2>
          </div>
          <div className="simple-feed">
            {workspace.isLoading ? (
              <Skeleton lines={2} label="Loading approved work" />
            ) : approved.length === 0 ? (
              <EmptyState
                tone="inset"
                title="Nothing approved yet"
                body="Anything you approve moves here, with the files to download."
              />
            ) : (
              approved.slice(0, 6).map((deliverable) => (
                <article key={deliverable.id}>
                  <span className="approved-icon">
                    <Check size={14} />
                  </span>
                  <div>
                    <strong>{deliverable.title}</strong>
                    <span>{clientStatusLabel(deliverable.status)}</span>
                  </div>
                  <time>{formatDate(deliverable.approvedAt ?? deliverable.updatedAt)}</time>
                </article>
              ))
            )}
          </div>
          {approved.length ? (
            <Link className="rx-action" to="/client/approved">
              See all approved work and download files <ArrowRight size={14} />
            </Link>
          ) : null}
        </section>
      </div>
    </ClientShell>
  );
}
