import {
  CheckCircle2,
  CornerDownRight,
  Download,
  MessageCircleReply,
  Paperclip,
  RotateCcw,
  Send,
  SmilePlus,
  SquareCheckBig,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { uploadAttachment } from "../../lib/attachment-upload";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/format";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const emojis = ["👍", "✅", "❤️", "👀", "🎯", "🔥", "👏", "🤔"];

export type ReviewComment = {
  id: string;
  fileVersionId: string | null;
  parentId: string | null;
  userId: string;
  message: string;
  visibility: "INTERNAL" | "CLIENT_VISIBLE";
  anchorType: "NONE" | "TIMECODE" | "REGION" | "WAVEFORM_RANGE";
  anchor: Record<string, unknown> | null;
  authorName: string;
  mentionUserIds: string[];
  hashtags: string[];
  resolvedAt: string | null;
  spawnedTaskId: string | null;
  reactionRows: Array<{ id: string; userId: string; emoji: string }>;
  attachmentRows: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: string;
  }>;
  createdAt: string;
};

export function CommentBody({
  message,
  onHashtag,
}: {
  message: string;
  onHashtag?(tag: string): void;
}) {
  const tokens = message.split(/(@[\p{L}\p{N}_.-]+|#[\p{L}\p{N}_-]+)/gu);
  let offset = 0;
  const pieces = tokens.map((token) => {
    const piece = { token, key: `${offset}:${token}` };
    offset += token.length;
    return piece;
  });
  return (
    <p className="comment-body">
      {pieces.map(({ token, key }) => {
        if (token.startsWith("@")) {
          return (
            <span className="comment-mention" key={key}>
              {token}
            </span>
          );
        }
        if (token.startsWith("#")) {
          return (
            <button
              type="button"
              className="comment-hashtag"
              key={key}
              onClick={() => onHashtag?.(token.slice(1).toLowerCase())}
            >
              {token}
            </button>
          );
        }
        return token;
      })}
    </p>
  );
}

export function ReactionBar({
  rows,
  myUserId,
  onToggle,
}: {
  rows: ReviewComment["reactionRows"];
  myUserId: string;
  onToggle(emoji: string, remove: boolean): void;
}) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(
    () =>
      Object.entries(
        rows.reduce<Record<string, string[]>>((result, row) => {
          result[row.emoji] = [...(result[row.emoji] ?? []), row.userId];
          return result;
        }, {}),
      ),
    [rows],
  );
  return (
    <div className="reaction-bar">
      {grouped.map(([emoji, users]) => (
        <button
          type="button"
          key={emoji}
          aria-pressed={users.includes(myUserId)}
          onClick={() => onToggle(emoji, users.includes(myUserId))}
        >
          {emoji} <span>{users.length}</span>
        </button>
      ))}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Add reaction">
        <SmilePlus size={13} />
      </button>
      {open ? (
        <div className="reaction-picker" role="menu">
          {emojis.map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => {
                onToggle(
                  emoji,
                  rows.some((row) => row.emoji === emoji && row.userId === myUserId),
                );
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReplyComposer({
  onSend,
  onCancel,
  uploadFile = uploadAttachment,
}: {
  onSend(message: string, attachmentIds: string[]): Promise<void>;
  onCancel(): void;
  uploadFile?(file: File): Promise<string>;
}) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="reply-composer">
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Reply in this thread…"
      />
      {attachments.map((attachment) => (
        <span className="attachment-chip" key={attachment.id}>
          <Paperclip size={11} /> {attachment.name}
        </span>
      ))}
      <div>
        <button type="button" onClick={() => input.current?.click()}>
          <Paperclip size={13} /> Attach
        </button>
        <input
          ref={input}
          hidden
          type="file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const id = await uploadFile(file);
              setAttachments((items) => [...items, { id, name: file.name }]);
            } finally {
              setUploading(false);
            }
          }}
        />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!message.trim() || uploading}
          onClick={async () => {
            await onSend(
              message,
              attachments.map((attachment) => attachment.id),
            );
            setMessage("");
            setAttachments([]);
          }}
        >
          <Send size={13} /> Reply
        </button>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  replies,
  myUserId,
  clientMode,
  onReply,
  onReact,
  onResolve,
  onConvert,
  onAnchor,
  onHashtag,
  uploadFile,
  onAttachmentDownload,
  activeCommentId,
}: {
  comment: ReviewComment;
  replies: ReviewComment[];
  myUserId: string;
  clientMode: boolean;
  onReply(parentId: string, message: string, attachmentIds: string[]): Promise<void>;
  onReact(commentId: string, emoji: string, remove: boolean): void;
  onResolve(commentId: string, reopen: boolean): void;
  onConvert(commentId: string): void;
  onAnchor(comment: ReviewComment): void;
  onHashtag(tag: string): void;
  uploadFile?(file: File): Promise<string>;
  onAttachmentDownload?(attachmentId: string): Promise<void>;
  activeCommentId?: string | null;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <article
      className="comment-card"
      data-resolved={Boolean(comment.resolvedAt)}
      data-internal={comment.visibility === "INTERNAL"}
      data-active={activeCommentId === comment.id}
    >
      <header>
        <span className="comment-avatar">{comment.authorName.slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>{comment.authorName}</strong>
          <time dateTime={comment.createdAt} title={formatAbsoluteTime(comment.createdAt)}>
            {formatRelativeTime(comment.createdAt)}
          </time>
        </div>
        <button type="button" className="comment-anchor" onClick={() => onAnchor(comment)}>
          {comment.anchorType === "TIMECODE" || comment.anchor?.timecodeMs
            ? `@ ${Math.floor(Number(comment.anchor?.timecodeMs ?? 0) / 60000)}:${String(
                Math.floor((Number(comment.anchor?.timecodeMs ?? 0) % 60000) / 1000),
              ).padStart(2, "0")}`
            : comment.anchorType === "REGION"
              ? "Pinned region"
              : comment.anchorType === "WAVEFORM_RANGE"
                ? "Audio range"
                : "General"}
        </button>
      </header>
      <CommentBody message={comment.message} onHashtag={onHashtag} />
      {comment.attachmentRows.length ? (
        <div className="comment-attachments">
          {comment.attachmentRows.map((attachment) => (
            <button
              type="button"
              key={attachment.id}
              onClick={async () => {
                if (onAttachmentDownload) {
                  await onAttachmentDownload(attachment.id);
                  return;
                }
                const response = await fetch(
                  `${apiUrl}/api/attachments/${attachment.id}/download`,
                  { credentials: "include" },
                );
                if (!response.ok) return;
                const { url } = (await response.json()) as { url: string };
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <Download size={12} /> {attachment.fileName}
            </button>
          ))}
        </div>
      ) : null}
      <ReactionBar
        rows={comment.reactionRows}
        myUserId={myUserId}
        onToggle={(emoji, remove) => onReact(comment.id, emoji, remove)}
      />
      <footer>
        <button type="button" onClick={() => setReplying((value) => !value)}>
          <MessageCircleReply size={13} /> Reply
        </button>
        <button type="button" onClick={() => onResolve(comment.id, Boolean(comment.resolvedAt))}>
          {comment.resolvedAt ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
          {comment.resolvedAt ? "Reopen" : "Resolve"}
        </button>
        {!clientMode ? (
          <button
            type="button"
            onClick={() => onConvert(comment.id)}
            data-task={Boolean(comment.spawnedTaskId)}
          >
            <SquareCheckBig size={13} />
            {comment.spawnedTaskId ? "View task" : "Convert to task"}
          </button>
        ) : null}
        {comment.visibility === "INTERNAL" ? <span>Agency only</span> : null}
      </footer>
      {comment.spawnedTaskId ? (
        <a className="task-chip" href={`#task-${comment.spawnedTaskId}`}>
          <SquareCheckBig size={12} /> Feedback tracked as a revision
        </a>
      ) : null}
      {replying ? (
        <ReplyComposer
          onCancel={() => setReplying(false)}
          uploadFile={uploadFile}
          onSend={async (message, attachmentIds) => {
            await onReply(comment.id, message, attachmentIds);
            setReplying(false);
          }}
        />
      ) : null}
      {replies.length ? (
        <div className="comment-replies">
          {replies.map((reply) => (
            <div key={reply.id}>
              <CornerDownRight size={14} />
              <CommentCard
                comment={reply}
                replies={[]}
                myUserId={myUserId}
                clientMode={clientMode}
                onReply={onReply}
                onReact={onReact}
                onResolve={onResolve}
                onConvert={onConvert}
                onAnchor={onAnchor}
                onHashtag={onHashtag}
                uploadFile={uploadFile}
                onAttachmentDownload={onAttachmentDownload}
                activeCommentId={activeCommentId}
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function CommentThread({
  comments,
  myUserId,
  clientMode,
  filter,
  hashtag,
  onReply,
  onReact,
  onResolve,
  onConvert,
  onAnchor,
  onHashtag,
  uploadFile,
  onAttachmentDownload,
  activeCommentId,
}: {
  comments: ReviewComment[];
  myUserId: string;
  clientMode: boolean;
  filter: "OPEN" | "RESOLVED" | "MINE" | "INTERNAL";
  hashtag: string | null;
  onReply(parentId: string, message: string, attachmentIds: string[]): Promise<void>;
  onReact(commentId: string, emoji: string, remove: boolean): void;
  onResolve(commentId: string, reopen: boolean): void;
  onConvert(commentId: string): void;
  onAnchor(comment: ReviewComment): void;
  onHashtag(tag: string | null): void;
  uploadFile?(file: File): Promise<string>;
  onAttachmentDownload?(attachmentId: string): Promise<void>;
  activeCommentId?: string | null;
}) {
  const roots = comments.filter((comment) => !comment.parentId);
  const visible = roots.filter((comment) => {
    if (hashtag && !comment.hashtags.includes(hashtag)) return false;
    if (filter === "OPEN") return !comment.resolvedAt;
    if (filter === "RESOLVED") return Boolean(comment.resolvedAt);
    if (filter === "MINE") return comment.userId === myUserId;
    return comment.visibility === "INTERNAL";
  });
  return (
    <div className="comment-thread" role="tree">
      {hashtag ? (
        <button type="button" className="hashtag-filter" onClick={() => onHashtag(null)}>
          #{hashtag} ×
        </button>
      ) : null}
      {visible.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          replies={comments.filter((reply) => reply.parentId === comment.id)}
          myUserId={myUserId}
          clientMode={clientMode}
          onReply={onReply}
          onReact={onReact}
          onResolve={onResolve}
          onConvert={onConvert}
          onAnchor={onAnchor}
          onHashtag={(tag) => onHashtag(tag)}
          uploadFile={uploadFile}
          onAttachmentDownload={onAttachmentDownload}
          activeCommentId={activeCommentId}
        />
      ))}
    </div>
  );
}
