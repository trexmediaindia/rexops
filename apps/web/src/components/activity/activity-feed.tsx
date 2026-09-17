import {
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Share2,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/format";

export type ActivityRow = {
  event: {
    id: string;
    type: string;
    summary: string;
    createdAt: string;
    meta: Record<string, unknown>;
  };
  actorName: string | null;
};

function icon(type: string) {
  if (type === "UPLOAD") return <UploadCloud size={14} />;
  if (type === "COMMENT") return <MessageSquareText size={14} />;
  if (type === "APPROVAL") return <CheckCircle2 size={14} />;
  if (type === "SHARE") return <Share2 size={14} />;
  return <Clock3 size={14} />;
}

export function ActivityFeed({
  rows,
  compact = false,
}: {
  rows: ActivityRow[];
  compact?: boolean;
}) {
  return (
    <div className="activity-feed" data-compact={compact}>
      {rows.map((row) => (
        <article key={row.event.id}>
          <span>{icon(row.event.type)}</span>
          <div>
            <strong>{row.event.summary}</strong>
            <small>
              <UserRound size={11} /> {row.actorName ?? "System"}
            </small>
          </div>
          <time
            className="rx-mono"
            dateTime={row.event.createdAt}
            title={formatAbsoluteTime(row.event.createdAt)}
          >
            {formatRelativeTime(row.event.createdAt)}
          </time>
        </article>
      ))}
      {!rows.length ? <p>No activity recorded yet.</p> : null}
    </div>
  );
}
