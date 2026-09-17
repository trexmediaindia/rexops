import { Button, Callout, EmptyState, humanize, Skeleton } from "@rexops/ui";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ShieldCheck } from "lucide-react";
import { AdminShell } from "../../components/app-shell";
import { PageHeader } from "../../components/ui/page-header";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/format";
import { request } from "../../lib/request";

type AuditRow = {
  log: {
    id: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    ip: string | null;
    createdAt: string;
  };
  actorName: string | null;
};

/*
 * The log stored `AGENCY_CREATED` / `DELIVERABLE` / a raw uuid and printed all
 * three verbatim, so the table read as a database dump rather than a record of
 * who did what. Each column now says the thing in words, and the identifier is
 * demoted to the small print beneath the thing it identifies.
 */
function describeTarget(targetType: string | null, targetId: string | null) {
  if (!targetType && !targetId) return { label: "Nothing in particular", id: null };
  return { label: targetType ? humanize(targetType) : "Unknown kind of record", id: targetId };
}

export function AdminAudit() {
  const audit = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => request<AuditRow[]>("/api/analytics/audit-log"),
  });

  const rows = audit.data ?? [];

  return (
    <AdminShell>
      <PageHeader
        eyebrow="Platform administration"
        title="Audit log"
        purpose="A record of who did what across every agency on this installation, newest first. It is written automatically and cannot be edited or deleted from here."
        help={
          <>
            <p>
              Sensitive actions are recorded here: creating an agency, changing what someone can do,
              approving work, and any read that crosses from one agency into another.
            </p>
            <p>
              Day-to-day activity inside a single agency is not listed here. An agency owner sees
              that on their own activity screen.
            </p>
          </>
        }
      />
      <div className="root-warning">
        <ShieldCheck size={17} /> This screen only reads. Nothing here can be changed or removed.
      </div>

      {audit.isError ? (
        <Callout tone="danger" title="The audit log did not load">
          {(audit.error as Error).message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => audit.refetch()}>
              Try loading it again
            </Button>
          </div>
        </Callout>
      ) : null}

      {audit.isLoading ? (
        <section className="panel">
          <Skeleton lines={5} label="Loading the audit log" />
        </section>
      ) : null}

      {!audit.isLoading && !audit.isError && rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={22} />}
          title="Nothing has been recorded yet"
          body="Entries appear here on their own as people use the platform. The first ones usually show up when an agency is created or someone's access changes."
        />
      ) : null}

      {rows.length > 0 ? (
        <section className="panel">
          <table className="data-table admin-table">
            <caption className="rx-visually-hidden">
              Recorded actions across every agency, newest first
            </caption>
            <thead>
              <tr className="data-table__head">
                <th scope="col">Who</th>
                <th scope="col">What they did</th>
                <th scope="col">What it was done to</th>
                <th scope="col">When</th>
                <th scope="col">From which address</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const target = describeTarget(row.log.targetType, row.log.targetId);
                return (
                  <tr className="data-table__row" key={row.log.id}>
                    <th scope="row">{row.actorName ?? "RexOps itself"}</th>
                    <td>{humanize(row.log.action)}</td>
                    <td>
                      {target.label}
                      {target.id ? (
                        <>
                          {" "}
                          <small className="rx-mono">{target.id}</small>
                        </>
                      ) : null}
                    </td>
                    <td title={formatAbsoluteTime(row.log.createdAt)}>
                      {formatRelativeTime(row.log.createdAt)}
                    </td>
                    <td className="rx-mono">{row.log.ip ?? "Not recorded"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <p className="list-footnote">
          Showing the {rows.length} most recent {rows.length === 1 ? "entry" : "entries"}. Times are
          shown relative to now — hover one to see the exact date and time.
        </p>
      ) : null}
    </AdminShell>
  );
}
