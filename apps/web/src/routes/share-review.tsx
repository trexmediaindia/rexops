import { Button, Callout, HelpTip, humanize } from "@rexops/ui";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  Download,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Paperclip,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import {
  type Anchor,
  type AnnotationTool,
  anchorTimecodeMs,
  mediumFromFileType,
  parseAnchor,
  type StoredAnnotation,
} from "../components/review/anchor";
import { AnnotationToolbar } from "../components/review/annotation-toolbar";
import { CommentThread, type ReviewComment } from "../components/review/comment-thread";
import { Field } from "../components/ui/field";
import { uploadGuestAttachment } from "../lib/attachment-upload";

const COMMENT_FILTER_LABELS: Record<string, string> = {
  OPEN: "Open",
  RESOLVED: "Resolved",
  MINE: "Mine",
  INTERNAL: "Internal",
};

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const RegisteredViewer = lazy(() =>
  import("../components/viewers/viewer-registry").then((module) => ({
    default: module.RegisteredViewer,
  })),
);

type SharePayload = {
  share: {
    allowComment: boolean;
    allowDownload: boolean;
    watermark: string;
    protected: boolean;
  };
  deliverable: { id: string; title: string; contentType: string };
  fileVersion: {
    id: string;
    versionNumber: number;
    label: string | null;
    fileName: string | null;
    fileType: string | null;
    previewUrl: string | null;
    downloadUrl: string | null;
  };
  comments: ReviewComment[];
  watermarkText: string | null;
};

async function publicRequest<T>(path: string, body: unknown) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? "This review link could not be opened.");
  }
  return response.json() as Promise<T>;
}

export function ShareReviewPage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const [passphrase, setPassphrase] = useState("");
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [guestName, setGuestName] = useState("");
  const [message, setMessage] = useState("");
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [filter, setFilter] = useState<"OPEN" | "RESOLVED" | "MINE" | "INTERNAL">("OPEN");
  const [hashtag, setHashtag] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [myReactions, setMyReactions] = useState(new Set<string>());
  const attachmentInput = useRef<HTMLInputElement>(null);
  const access = useMutation({
    mutationFn: () =>
      publicRequest<SharePayload>(`/api/public/shares/${token}/access`, {
        passphrase: passphrase || undefined,
      }),
    onSuccess: setPayload,
  });
  async function refresh() {
    setPayload(
      await publicRequest<SharePayload>(`/api/public/shares/${token}/access`, {
        passphrase: passphrase || undefined,
      }),
    );
  }
  const comment = useMutation({
    mutationFn: (input: { message: string; parentId?: string; attachmentIds?: string[] }) =>
      publicRequest(`/api/public/shares/${token}/comments`, {
        passphrase: passphrase || undefined,
        guestName,
        message: input.message,
        parentId: input.parentId,
        attachmentIds: input.attachmentIds ?? [],
        fileVersionId: payload?.fileVersion.id,
        anchorType:
          anchor && anchor.type !== "NONE"
            ? anchor.type
            : payload?.fileVersion.fileType?.startsWith("video/")
              ? "TIMECODE"
              : "NONE",
        anchor:
          anchor && anchor.type !== "NONE"
            ? anchor
            : payload?.fileVersion.fileType?.startsWith("video/")
              ? { timecodeMs: Math.round(currentTime * 1000) }
              : undefined,
      }),
    onSuccess: async () => {
      setMessage("");
      setAnchor(null);
      setAttachments([]);
      await refresh();
    },
  });
  const react = useMutation({
    mutationFn: ({
      commentId,
      emoji,
      remove,
    }: {
      commentId: string;
      emoji: string;
      remove: boolean;
    }) =>
      publicRequest(`/api/public/shares/${token}/comments/${commentId}/reactions`, {
        passphrase: passphrase || undefined,
        guestName,
        emoji,
        remove,
      }),
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: ({ commentId, reopen }: { commentId: string; reopen: boolean }) =>
      publicRequest(`/api/public/shares/${token}/comments/${commentId}/resolve`, {
        passphrase: passphrase || undefined,
        guestName,
        reopen,
      }),
    onSuccess: refresh,
  });

  if (!payload) {
    return (
      <main className="share-gate">
        <section>
          <span className="wordmark__mark">R</span>
          <LockKeyhole size={24} />
          <span className="rx-eyebrow">Shared with you for feedback</span>
          <h1>Open the work shared with you</h1>
          <p>
            Someone at a creative agency sent you this link so you can look at a piece of work and
            say what you think. You do not need an account, and nothing you see here is public.
          </p>
          <Field
            label="Passphrase"
            hint="Only needed if the agency gave you one, usually in a separate message. Otherwise leave it empty."
            optional
            error={access.error ? access.error.message : null}
          >
            {(field) => (
              <input
                {...field}
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="e.g. autumn-reel-24"
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === "Enter") access.mutate();
                }}
              />
            )}
          </Field>
          <Button onClick={() => access.mutate()} disabled={access.isPending}>
            {access.isPending ? "Opening it…" : "Open the work"}
          </Button>
        </section>
      </main>
    );
  }

  /* Commenting was silently disabled until a name was typed, with nothing on
   * screen saying so — the commonest "why is this greyed out?" in the product. */
  const needsName = guestName.trim().length < 2;
  const upload = (file: File) => uploadGuestAttachment(token, passphrase, guestName, file);
  return (
    <main className="shared-review">
      <header>
        <div className="wordmark">
          <span className="wordmark__mark">R</span>
          <span>RexOps review</span>
        </div>
        <div>
          <ShieldCheck size={15} /> Shared link · version {payload.fileVersion.versionNumber}
          <HelpTip label="What this link lets you do" align="end">
            <p>
              This link opens one version of one piece of work.{" "}
              {payload.share.allowComment
                ? "You can watch or read it and leave comments."
                : "You can look through it and read the comments, but not add any."}{" "}
              {payload.share.allowDownload
                ? "You can also download the file."
                : "Downloading is turned off for this link."}
            </p>
            <p>
              If the agency shares a newer version later, they will send a new link. What you see
              here does not change underneath you.
            </p>
          </HelpTip>
        </div>
      </header>
      <div className="shared-review__layout">
        <section className="shared-review__stage">
          <div>
            <span className="rx-eyebrow">
              {humanize(payload.deliverable.contentType)} · for your feedback
            </span>
            <h1>{payload.deliverable.title}</h1>
            <p>{payload.fileVersion.label || payload.fileVersion.fileName}</p>
          </div>
          {mediumFromFileType(payload.fileVersion.fileType) !== "audio" &&
          mediumFromFileType(payload.fileVersion.fileType) !== "other" ? (
            <AnnotationToolbar
              medium={mediumFromFileType(payload.fileVersion.fileType)}
              tool={tool}
              onToolChange={setTool}
            />
          ) : null}
          <div className="shared-review__media">
            {payload.fileVersion.previewUrl ? (
              <Suspense fallback={<p>Getting the file ready to view…</p>}>
                <RegisteredViewer
                  url={payload.fileVersion.previewUrl}
                  fileName={payload.fileVersion.fileName ?? "Shared review asset"}
                  fileType={payload.fileVersion.fileType}
                  currentTime={currentTime}
                  onTime={setCurrentTime}
                  onDuration={setDuration}
                  tool={tool}
                  annotations={payload.comments
                    .map(
                      (c): StoredAnnotation => ({
                        id: c.id,
                        anchor: parseAnchor(c.anchorType, c.anchor),
                        resolved: Boolean(c.resolvedAt),
                      }),
                    )
                    .filter(
                      (a) => a.anchor.type === "REGION" || a.anchor.type === "WAVEFORM_RANGE",
                    )}
                  activeAnnotationId={activeCommentId}
                  onCreate={setAnchor}
                  onActivate={setActiveCommentId}
                />
              </Suspense>
            ) : (
              <p>
                This file cannot be played in the browser. Ask the agency to share a version you can
                view, or to send the file itself.
              </p>
            )}
            {payload.watermarkText ? (
              <span className="shared-watermark">{payload.watermarkText}</span>
            ) : null}
            <span hidden>{duration}</span>
          </div>
          {anchor ? (
            <span className="anchor-chip">
              {anchor.type === "WAVEFORM_RANGE" ? "Audio range pinned" : "Region pinned"}
              <button type="button" onClick={() => setAnchor(null)}>
                <X size={11} />
              </button>
            </span>
          ) : null}
          {payload.fileVersion.downloadUrl ? (
            <a href={payload.fileVersion.downloadUrl}>
              <Download size={15} /> Download this file
            </a>
          ) : null}
        </section>
        <aside className="shared-review__comments">
          <div>
            <span className="rx-eyebrow">Feedback on this version</span>
            <h2>
              {payload.comments.length} {payload.comments.length === 1 ? "comment" : "comments"}
            </h2>
          </div>
          <div className="comment-filters segmented">
            {(["OPEN", "RESOLVED", "MINE"] as const).map((item) => (
              <button
                type="button"
                data-active={filter === item}
                key={item}
                onClick={() => setFilter(item)}
              >
                {COMMENT_FILTER_LABELS[item]}
              </button>
            ))}
          </div>
          <div className="shared-review__feed">
            <CommentThread
              comments={payload.comments}
              myUserId="guest-local"
              clientMode
              filter={filter}
              hashtag={hashtag}
              onHashtag={setHashtag}
              uploadFile={upload}
              onAttachmentDownload={async (attachmentId) => {
                const result = await publicRequest<{ url: string }>(
                  `/api/public/shares/${token}/attachments/${attachmentId}/download`,
                  { passphrase: passphrase || undefined },
                );
                window.open(result.url, "_blank", "noopener,noreferrer");
              }}
              onReply={async (parentId, reply, attachmentIds) => {
                await comment.mutateAsync({ message: reply, parentId, attachmentIds });
              }}
              onReact={(commentId, emoji) => {
                if (guestName.trim().length < 2) return;
                const key = `${commentId}:${emoji}`;
                const remove = myReactions.has(key);
                setMyReactions((current) => {
                  const next = new Set(current);
                  if (remove) next.delete(key);
                  else next.add(key);
                  return next;
                });
                react.mutate({ commentId, emoji, remove });
              }}
              onResolve={(commentId, reopen) => {
                if (guestName.trim().length >= 2) resolve.mutate({ commentId, reopen });
              }}
              onConvert={() => undefined}
              onAnchor={(item) => {
                const ms = anchorTimecodeMs(parseAnchor(item.anchorType, item.anchor));
                if (ms != null) setCurrentTime(ms / 1000);
                setActiveCommentId(item.id);
              }}
              activeCommentId={activeCommentId}
            />
            {!payload.comments.length ? (
              <p className="shared-review__empty">
                <MessageSquareText size={20} />
                {payload.share.allowComment
                  ? "No comments yet. Play or scroll to the part you want to talk about, then write below — your comment stays pinned to that spot."
                  : "No comments have been left on this version yet."}
              </p>
            ) : null}
          </div>
          {payload.share.allowComment ? (
            <div className="shared-comment-form">
              <Field
                label="Your name"
                hint="Shown next to your comment so the agency knows who left it."
              >
                {(field) => (
                  <input
                    {...field}
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder="e.g. Priya Nair"
                    autoComplete="name"
                  />
                )}
              </Field>
              {attachments.map((attachment) => (
                <span className="attachment-chip" key={attachment.id}>
                  <Paperclip size={11} /> {attachment.name}
                </span>
              ))}
              <Field
                label="Your comment"
                hint={
                  anchor
                    ? "This will be pinned to the part of the file you marked."
                    : "Say what you would change and where. Mark the file above first to pin the comment to a spot."
                }
              >
                {(field) => (
                  <textarea
                    {...field}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="The logo sits too close to the edge here."
                    rows={3}
                  />
                )}
              </Field>
              {needsName ? (
                <p className="shared-comment-form__blocked">
                  Add your name above before commenting, so the agency knows who the feedback is
                  from.
                </p>
              ) : null}
              {comment.error ? (
                <Callout tone="danger" title="Your comment was not posted">
                  {(comment.error as Error).message}
                </Callout>
              ) : null}
              <div>
                <button
                  type="button"
                  disabled={needsName}
                  onClick={() => attachmentInput.current?.click()}
                >
                  <Paperclip size={13} /> Attach a file
                </button>
                <input
                  ref={attachmentInput}
                  hidden
                  type="file"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const id = await upload(file);
                      setAttachments((items) => [...items, { id, name: file.name }]);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                <Button
                  disabled={needsName || !message.trim() || comment.isPending || uploading}
                  onClick={() =>
                    comment.mutate({
                      message,
                      attachmentIds: attachments.map((attachment) => attachment.id),
                    })
                  }
                >
                  {uploading ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{" "}
                  {uploading
                    ? "Uploading your file…"
                    : comment.isPending
                      ? "Posting your comment…"
                      : "Post my comment"}
                </Button>
              </div>
            </div>
          ) : null}
          {!payload.share.allowComment ? (
            <p className="shared-review__readonly">
              This link is for reading. You can look through the work and everyone else's comments,
              but you cannot add one. Ask the agency for a link that allows comments if you need to.
            </p>
          ) : null}
          <small className="shared-review__link-note">
            <Link2 size={11} /> Comments stay attached to this exact version, so they cannot be
            confused with feedback on a later one.
          </small>
        </aside>
      </div>
    </main>
  );
}
