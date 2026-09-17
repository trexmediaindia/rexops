import { Button, Callout, EmptyState, HelpTip, Skeleton, StatusChip } from "@rexops/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Download, LoaderCircle, PackageCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { ClientShell } from "../../components/app-shell";
import { formatDate, SETTLED, useClientWorkspace } from "../../lib/client-workspace";
import { formatBytes, titleCase } from "../../lib/format";
import { request } from "../../lib/request";
import type { DeliverableRecord } from "../../lib/types";

type VersionSummary = {
  id: string;
  versionNumber: number;
  label: string | null;
  fileName: string | null;
  fileSizeBytes: number | string | null;
  status: string;
  visibility: string;
};

export function ClientApproved() {
  const workspace = useClientWorkspace();

  const approved = useMemo(
    () =>
      workspace.deliverables
        .filter((item) => SETTLED.has(item.status))
        .sort(
          (a, b) =>
            new Date(b.approvedAt ?? b.updatedAt).getTime() -
            new Date(a.approvedAt ?? a.updatedAt).getTime(),
        ),
    [workspace.deliverables],
  );

  // Grouped by project so a client looking for "the June retainer files" finds
  // them together rather than scattered through one long reverse-chronology.
  const grouped = useMemo(() => {
    const map = new Map<string, DeliverableRecord[]>();
    for (const item of approved) {
      const bucket = map.get(item.projectId);
      if (bucket) bucket.push(item);
      else map.set(item.projectId, [item]);
    }
    return [...map.entries()];
  }, [approved]);

  const projectName = (id: string) =>
    workspace.projects.find((project) => project.id === id)?.name ?? "Project";

  return (
    <ClientShell>
      <div className="client-heading">
        <span className="rx-eyebrow">Signed off</span>
        <h1>
          Approved
          <HelpTip label="Approved">
            <p>
              Everything you have signed off, grouped by the project it belongs to. The exact file
              you approved is kept here, so this is the record of what was agreed.
            </p>
            <p>
              Approving is final from your side. If something needs to change after this, ask your
              agency and they will share a new version for review.
            </p>
          </HelpTip>
        </h1>
        <p>
          {approved.length
            ? `${approved.length} ${approved.length === 1 ? "piece of work you have" : "pieces of work you have"} approved, each with the exact files you approved. Open a row to download them.`
            : "Work you sign off lands here, together with the files you approved."}
        </p>
      </div>

      {workspace.isLoading ? (
        <Skeleton lines={4} label="Loading approved work" />
      ) : workspace.error ? (
        <Callout tone="danger" title="Your approved work did not load">
          {workspace.error.message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={workspace.refetch}>
              Try loading it again
            </Button>
          </div>
        </Callout>
      ) : !approved.length ? (
        <EmptyState
          icon={<PackageCheck size={22} />}
          title="You have not approved anything yet"
          body="Once you approve a piece of work it moves here for good, with every version that was shared with you and the files to download."
          action={
            <Link className="rx-button rx-button--secondary" to="/client/home">
              See what is waiting on your decision
            </Link>
          }
        />
      ) : (
        grouped.map(([projectId, items]) => (
          <section className="client-section client-section--plain" key={projectId}>
            <div className="client-section__heading">
              <h2>
                {projectName(projectId)}{" "}
                <span className="rx-mono">{String(items.length).padStart(2, "0")}</span>
              </h2>
            </div>
            <div className="approved-list">
              {items.map((deliverable) => (
                <ApprovedRow key={deliverable.id} deliverable={deliverable} />
              ))}
            </div>
          </section>
        ))
      )}
    </ClientShell>
  );
}

/**
 * One approved deliverable. The version list is fetched only when the row is
 * expanded — a client with a long history would otherwise fire one request per
 * deliverable on mount.
 */
function ApprovedRow({ deliverable }: { deliverable: DeliverableRecord }) {
  const [open, setOpen] = useState(false);

  const versions = useQuery({
    queryKey: ["client-versions", deliverable.id],
    queryFn: () => request<VersionSummary[]>(`/api/file-versions/deliverable/${deliverable.id}`),
    enabled: open,
  });

  return (
    <article className="approved-row" data-open={open}>
      <div className="approved-row__head">
        <span className="approved-icon">
          <Check size={14} />
        </span>
        <div>
          <strong>{deliverable.title}</strong>
          <span>{titleCase(deliverable.contentType)}</span>
        </div>
        <StatusChip status={deliverable.status} />
        <time>{formatDate(deliverable.approvedAt ?? deliverable.updatedAt)}</time>
        <button
          type="button"
          className="rx-action"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide the files" : "Show the files"}
        </button>
        <Link
          className="rx-action rx-action--accent"
          to="/client/review/$deliverableId"
          params={{ deliverableId: deliverable.id }}
        >
          Open the review <ArrowUpRight size={14} />
        </Link>
      </div>

      {open ? (
        <div className="approved-row__files">
          {versions.isLoading ? (
            <p className="simple-feed__loading">
              <LoaderCircle className="spin" size={15} /> Loading files…
            </p>
          ) : versions.isError ? (
            <Callout tone="danger" title="The file list did not load">
              {(versions.error as Error).message}
              <div className="rx-callout__action">
                <Button variant="secondary" onClick={() => versions.refetch()}>
                  Try again
                </Button>
              </div>
            </Callout>
          ) : !versions.data?.length ? (
            <p className="simple-feed__empty">
              This was approved without a file attached. Ask your agency if you were expecting one.
            </p>
          ) : (
            versions.data.map((version) => <VersionLine key={version.id} version={version} />)
          )}
        </div>
      ) : null}
    </article>
  );
}

function VersionLine({ version }: { version: VersionSummary }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The API hands back a signed URL rather than the bytes, so the click has to
   * resolve that first and then hand the browser the real location. */
  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const { url } = await request<{ url: string }>(`/api/file-versions/${version.id}/download`);
      window.open(url, "_blank", "noopener");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="approved-file">
      <PackageCheck size={15} />
      <div>
        <strong>
          v{version.versionNumber}
          {version.label ? ` · ${version.label}` : ""}
        </strong>
        <span>
          {version.fileName ?? "Shared file"}
          {version.fileSizeBytes ? ` · ${formatBytes(Number(version.fileSizeBytes))}` : ""}
        </span>
        {error ? (
          <em className="approved-file__error">The download link could not be prepared. {error}</em>
        ) : null}
      </div>
      <button type="button" onClick={download} disabled={downloading}>
        <Download size={14} /> {downloading ? "Preparing the link…" : "Download this file"}
      </button>
    </div>
  );
}
