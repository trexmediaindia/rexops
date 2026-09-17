import type { JsonObject } from "@liveblocks/client";
import { useBroadcastEvent, useMyPresence } from "@liveblocks/react";
import { Button, Callout, StatusChip } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Columns2,
  Eye,
  Gauge,
  Link2,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Pause,
  Play,
  Send,
  Share2,
  ShieldCheck,
  Smile,
  Users,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgencyShell, ClientShell } from "../components/app-shell";
import { CompareDialog } from "../components/compare/compare-dialog";
import {
  type CompareMode,
  CompareStage,
  type CompareZoom,
} from "../components/compare/compare-stage";
import { ScrubPreview } from "../components/media/scrub-preview";
import { FollowBanner } from "../components/presence/follow-banner";
import { GhostPlayheads } from "../components/presence/ghost-playheads";
import { PresenceAvatars } from "../components/presence/presence-avatars";
import { TypingIndicator } from "../components/presence/typing-indicator";
import { ViewerDots } from "../components/presence/viewer-dots";
import {
  type Anchor,
  type AnnotationTool,
  anchorTimecodeMs,
  mediumFromFileType,
  parseAnchor,
  type StoredAnnotation,
} from "../components/review/anchor";
import { AnnotationToolbar } from "../components/review/annotation-toolbar";
import {
  type Approval,
  type ReviewRun,
  StageTimeline,
} from "../components/review/audit/stage-timeline";
import { CommentThread, type ReviewComment } from "../components/review/comment-thread";
import { type ReviewCapabilities, resolveCapabilities } from "../components/review/review-session";
import { Field } from "../components/ui/field";
import type { FileVersionView } from "../components/versioning/types";
import { VersionChips, VersionPicker } from "../components/versioning/version-picker";
import { VersionRail } from "../components/versioning/version-rail";
import type { ViewerFocus } from "../components/viewers/viewer-registry";
import { uploadAttachment } from "../lib/attachment-upload";
import { authClient } from "../lib/auth-client";
import { titleCase } from "../lib/format";
import type { RexSelection } from "../lib/liveblocks.config";
import { broadcastInvalidation, broadcastRoomEvent } from "../lib/realtime";
import { enqueueUploads, useUploadStore } from "../lib/upload-store";
import { useFollow } from "../lib/use-follow";
import { useLiveRoomEvents } from "../lib/use-live-room-events";

const COMMENT_FILTER_LABELS: Record<string, string> = {
  OPEN: "Open",
  RESOLVED: "Resolved",
  MINE: "Mine",
  INTERNAL: "Internal",
};

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type Deliverable = {
  id: string;
  title: string;
  status: string;
  contentType: string;
};
type ReviewUser = { id: string; name: string; image: string | null; role: string };
type RoomData = {
  deliverable: Deliverable;
  versions: FileVersionView[];
  comments: ReviewComment[];
  approvals: Approval[];
  runs: ReviewRun[];
  users: ReviewUser[];
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function timecode(milliseconds: number) {
  const totalSeconds = Math.max(0, milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * 24);
  return [hours, minutes, seconds, frames].map((part) => String(part).padStart(2, "0")).join(":");
}

function anchorPayload(anchor: Anchor | null, currentTime: number, fileType: string | null) {
  if (anchor && anchor.type !== "NONE") {
    return { anchorType: anchor.type, anchor };
  }
  // No explicit region drawn: video still anchors to the current frame timecode.
  if (fileType?.startsWith("video/")) {
    return { anchorType: "TIMECODE", anchor: { timecodeMs: Math.round(currentTime * 1000) } };
  }
  return { anchorType: "NONE" };
}

/**
 * What each decision is, in the words of the person making it. The form used to
 * carry no labels at all — placeholders only — and a button that read
 * "Confirm request_changes".
 */
const DECISIONS = {
  APPROVE: {
    heading: "Approve this version",
    result:
      "The approval is recorded against this version with your name and the time. Once every approver on this stage has approved, the deliverable moves on.",
    noteLabel: "Note for the record",
    noteHint:
      "Anything you want stored alongside your approval. Everyone on the review can read it.",
    notePlaceholder: "Happy with this cut — good to go.",
    noteRequired: false,
    confirm: "Record my approval",
    pending: "Recording your approval…",
  },
  REQUEST_CHANGES: {
    heading: "Ask for changes",
    result:
      "The deliverable goes back for a revision and the team is told what you want changed. Your comments on this version stay attached to it.",
    noteLabel: "What needs to change",
    noteHint:
      "Be specific — this is what the team works from. Point to timecodes or areas where you can.",
    notePlaceholder: "Trim the intro to 3 seconds and use the client's updated logo at 0:12.",
    noteRequired: true,
    confirm: "Send it back for changes",
    pending: "Sending it back…",
  },
  REJECT: {
    heading: "Reject this version",
    result:
      "This version is closed as not usable. It is stronger than asking for changes: the work is expected to start again rather than be revised.",
    noteLabel: "Why it is being rejected",
    noteHint: "Say what is wrong with the approach, so the next attempt does not repeat it.",
    notePlaceholder:
      "This is off-brief — the brief asked for a product-led cut, not a testimonial.",
    noteRequired: true,
    confirm: "Reject this version",
    pending: "Recording the rejection…",
  },
} as const;

/** Shown next to the signature box and stored with the approval. */
const SIGNATURE_CONSENT = "I confirm that I am authorized to approve this version.";

function DecisionBar({
  capabilities,
  status,
  versionId,
  deliverableId,
  roomId,
}: {
  capabilities: ReviewCapabilities;
  status: string;
  versionId: string;
  deliverableId: string;
  roomId: string;
}) {
  const requiresSignature = capabilities.decision.requiresESignature;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [signature, setSignature] = useState("");
  const [decision, setDecision] = useState<"APPROVE" | "REQUEST_CHANGES" | "REJECT" | null>(null);
  const action = useMutation({
    mutationFn: async (nextDecision: "APPROVE" | "REQUEST_CHANGES" | "REJECT") =>
      request(`/api/reviews/deliverables/${deliverableId}/decisions`, {
        method: "POST",
        body: JSON.stringify({
          fileVersionId: versionId,
          decision: nextDecision,
          feedback: feedback || undefined,
          eSignature: nextDecision === "APPROVE" ? signature || undefined : undefined,
          signatureConsentText:
            nextDecision === "APPROVE" && requiresSignature ? SIGNATURE_CONSENT : undefined,
          signatureConsentVersion:
            nextDecision === "APPROVE" && requiresSignature ? "2026-06-22" : undefined,
        }),
      }),
    onSuccess: async (_, nextDecision) => {
      setDecision(null);
      setFeedback("");
      setSignature("");
      broadcastRoomEvent(roomId, {
        type: "DECISION_MADE",
        deliverableId,
        versionId,
        decision: nextDecision,
      });
      await queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] });
      broadcastInvalidation({
        room: roomId,
        queryKeys: [["review-room", deliverableId]],
      });
    },
  });
  const workflow = useMutation({
    mutationFn: (kind: "submit-internal" | "promote") =>
      request(`/api/reviews/deliverables/${deliverableId}/${kind}`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] });
      broadcastInvalidation({ room: roomId, queryKeys: [["review-room", deliverableId]] });
    },
  });

  const isAgency = capabilities.side === "AGENCY";
  if (isAgency && status === "READY_FOR_INTERNAL_REVIEW") {
    return (
      <div className="decision-bar">
        <div>
          <ShieldCheck size={17} />
          <span>
            Nothing has been approved yet. Handing it over asks your own approvers to decide. The
            client still sees nothing.
          </span>
        </div>
        <Button disabled={workflow.isPending} onClick={() => workflow.mutate("submit-internal")}>
          {workflow.isPending ? "Handing it over…" : "Hand it to your team to review"}
        </Button>
      </div>
    );
  }
  if (isAgency && status === "INTERNAL_APPROVED") {
    return (
      <div className="decision-bar">
        <div>
          <Eye size={17} />
          <span>
            Your team has approved this internally. Sending it puts this version in the client's
            portal and asks them for their decision.
          </span>
        </div>
        <Button disabled={workflow.isPending} onClick={() => workflow.mutate("promote")}>
          {workflow.isPending ? "Sending it to the client…" : "Send it to the client"}
        </Button>
      </div>
    );
  }
  // Decision authority comes from the authenticated user's role + membership in the
  // currently-active review stage — never from the URL. This is the approve-leak fix.
  const canDecide = capabilities.decision.canApprove;
  if (!canDecide) {
    /* This bar used to read "No decision is required at this stage." to everybody,
       which answers neither "why not?" nor "so who is it waiting on?". The reason
       is computed in resolveCapabilities; it just never reached the screen. */
    return (
      <div className="decision-bar decision-bar--quiet">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          {capabilities.decision.blockedReason ?? "No decision is being asked of you right now."}
        </span>
      </div>
    );
  }
  const chosen = decision ? DECISIONS[decision] : null;
  const noteMissing = chosen ? chosen.noteRequired && !feedback.trim() : false;
  const signatureMissing =
    requiresSignature && decision === "APPROVE" && signature.trim().length < 2;
  return (
    <div className="decision-bar decision-bar--decisions">
      {decision && chosen ? (
        <div className="decision-confirm">
          <div>
            <strong>{chosen.heading}</strong>
            <button
              type="button"
              onClick={() => setDecision(null)}
              aria-label="Go back without deciding"
            >
              <X size={15} />
            </button>
          </div>
          <p className="decision-confirm__result">{chosen.result}</p>
          {decision === "APPROVE" && requiresSignature ? (
            <Field
              label="Sign with your full name"
              hint={SIGNATURE_CONSENT}
              help={
                <p>
                  Client approvals are signed so there is a record of who agreed to this version and
                  when. Your name is stored alongside the decision and shown in the approval trail.
                </p>
              }
            >
              {(field) => (
                <input
                  {...field}
                  value={signature}
                  onChange={(event) => setSignature(event.target.value)}
                  placeholder="e.g. Priya Nair"
                  autoComplete="name"
                />
              )}
            </Field>
          ) : null}
          <Field label={chosen.noteLabel} hint={chosen.noteHint} optional={!chosen.noteRequired}>
            {(field) => (
              <textarea
                {...field}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder={chosen.notePlaceholder}
                rows={3}
              />
            )}
          </Field>
          {action.error ? (
            <Callout tone="danger" title="That decision was not recorded">
              {action.error.message}
            </Callout>
          ) : null}
          <Button
            disabled={action.isPending || noteMissing || signatureMissing}
            onClick={() => action.mutate(decision)}
          >
            {action.isPending ? chosen.pending : chosen.confirm}
          </Button>
          {noteMissing || signatureMissing ? (
            <p className="decision-confirm__missing">
              Still needed:{" "}
              {[
                signatureMissing ? "your signature" : null,
                noteMissing ? chosen.noteLabel.toLowerCase() : null,
              ]
                .filter(Boolean)
                .join(" and ")}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <span className="decision-bar__ask">This version is waiting on your decision.</span>
          <button type="button" onClick={() => setDecision("APPROVE")}>
            <Check size={16} /> Approve this version
          </button>
          <button type="button" onClick={() => setDecision("REQUEST_CHANGES")}>
            <MessageSquareText size={16} /> Ask for changes
          </button>
          <button type="button" onClick={() => setDecision("REJECT")}>
            <XCircle size={16} /> Reject this version
          </button>
        </>
      )}
    </div>
  );
}

export function ReviewRoom({ clientMode = false }: { clientMode?: boolean }) {
  const { deliverableId } = useParams({ strict: false }) as { deliverableId: string };
  const roomId = `review:${deliverableId}${clientMode ? ":client" : ""}`;
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const myUserId = session.data?.user.id ?? "";
  const myName = session.data?.user.name ?? "Reviewer";
  const [, updatePresence] = useMyPresence();
  const broadcast = useBroadcastEvent();
  const { items: uploads } = useUploadStore();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("SIDE_BY_SIDE");
  const [zoom, setZoom] = useState<CompareZoom>({ scale: 1, x: 0, y: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState<"INTERNAL" | "CLIENT_VISIBLE">("CLIENT_VISIBLE");
  const [region, setRegion] = useState<Anchor | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const viewerFocus = useRef<ViewerFocus | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [commentFilter, setCommentFilter] = useState<"OPEN" | "RESOLVED" | "MINE" | "INTERNAL">(
    "OPEN",
  );
  const [hashtag, setHashtag] = useState<string | null>(null);
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const [refVersionIds, setRefVersionIds] = useState<string[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<Array<{ id: string; name: string }>>([]);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [followId, setFollowId] = useState<number | null>(null);
  const [hover, setHover] = useState<{ time: number; percent: number } | null>(null);
  const [liveReactions, setLiveReactions] = useState<
    Array<{ id: string; emoji: string; x: number; y: number }>
  >([]);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const lastPresence = useRef(0);

  const room = useQuery({
    queryKey: ["review-room", deliverableId],
    queryFn: async (): Promise<RoomData> => {
      const [deliverable, versions, comments, approvals, runs, users] = await Promise.all([
        request<Deliverable>(`/api/deliverables/${deliverableId}`),
        request<FileVersionView[]>(`/api/file-versions/deliverable/${deliverableId}`),
        request<ReviewComment[]>(`/api/reviews/deliverables/${deliverableId}/comments`),
        request<Approval[]>(`/api/reviews/deliverables/${deliverableId}/approvals`),
        request<ReviewRun[]>(`/api/reviews/deliverables/${deliverableId}/stages`),
        clientMode ? Promise.resolve([]) : request<ReviewUser[]>("/api/reviews/users"),
      ]);
      return { deliverable, versions, comments, approvals, runs, users };
    },
  });
  const selected = useMemo(
    () =>
      room.data?.versions.find((version) => version.id === selectedVersionId) ??
      room.data?.versions[0] ??
      null,
    [room.data?.versions, selectedVersionId],
  );
  const compare = room.data?.versions.find((version) => version.id === compareId) ?? null;
  const selectedComments =
    room.data?.comments.filter((comment) => comment.fileVersionId === selected?.id) ?? [];

  // Resolve the authenticated viewer's capabilities from their REAL role + their
  // membership in the active review stage — not from the route's clientMode. The role
  // comes from the session (better-auth additional field), with the room's users list and
  // finally the route hint as fallbacks. See review-session.ts.
  const myRole =
    (session.data?.user as { role?: string } | undefined)?.role ??
    room.data?.users.find((user) => user.id === myUserId)?.role ??
    (clientMode ? "CLIENT_OWNER" : "AGENCY_MEMBER");
  const capabilities = useMemo<ReviewCapabilities>(
    () =>
      resolveCapabilities({
        role: myRole,
        userId: myUserId,
        isShare: false,
        runs: room.data?.runs ?? [],
        approvals: room.data?.approvals ?? [],
      }),
    [myRole, myUserId, room.data?.runs, room.data?.approvals],
  );

  // Map comments → stored annotations the viewer can render back onto the media.
  const toStored = (list: ReviewComment[]): StoredAnnotation[] =>
    list
      .map((c) => ({
        id: c.id,
        anchor: parseAnchor(c.anchorType, c.anchor),
        resolved: Boolean(c.resolvedAt),
      }))
      .filter((a) => a.anchor.type === "REGION" || a.anchor.type === "WAVEFORM_RANGE");
  const compareComments =
    room.data?.comments.filter((comment) => comment.fileVersionId === compare?.id) ?? [];
  const pendingDraft: StoredAnnotation[] =
    region && region.type !== "NONE" && region.type !== "TIMECODE"
      ? [{ id: "__pending__", anchor: region }]
      : [];
  const annotationsA = [...toStored(selectedComments), ...pendingDraft];
  const annotationsB = toStored(compareComments);
  const pendingUploads = uploads.filter(
    (upload) =>
      upload.deliverableId === deliverableId &&
      upload.purpose === "VERSION" &&
      !["done", "canceled"].includes(upload.status),
  );
  const sprite = useQuery({
    queryKey: ["version-sprite", selected?.id],
    queryFn: () =>
      request<{
        url: string;
        intervalMs: number;
        columns: number;
        rows: number;
        cellWidth: number;
        cellHeight: number;
        durationMs: number;
      }>(`/api/file-versions/${selected?.id}/sprite`),
    enabled: Boolean(selected?.id && selected?.fileType?.startsWith("video/")),
    retry: false,
  });

  const selectVersion = useCallback((id: string, local = true) => {
    setSelectedVersionId(id);
    setRegion(null);
    if (local) setFollowId(null);
  }, []);
  const setTime = useCallback((seconds: number, local = true) => {
    setCurrentTime(seconds);
    if (local) setFollowId(null);
  }, []);
  // focusAnchor: clicking a comment (or marker) lands the viewer on its exact spot —
  // version, time, pdf page — and highlights it. Works for every anchor type. See §8.
  const focusAnchor = useCallback(
    (comment: ReviewComment) => {
      if (comment.fileVersionId && comment.fileVersionId !== selectedVersionId) {
        setSelectedVersionId(comment.fileVersionId);
      }
      const anchor = parseAnchor(comment.anchorType, comment.anchor);
      const ms = anchorTimecodeMs(anchor);
      if (ms != null) {
        setCurrentTime(ms / 1000);
        viewerFocus.current?.seekMs?.(ms);
      }
      if (anchor.type === "REGION" && anchor.page != null) {
        viewerFocus.current?.goToPage?.(anchor.page);
      }
      setActiveCommentId(comment.id);
      setFollowId(null);
    },
    [selectedVersionId],
  );
  const setCompared = useCallback((id: string | null) => setCompareId(id), []);
  const followed = useFollow({
    connectionId: followId,
    onVersion: (id) => selectVersion(id, false),
    onTime: (seconds) => setTime(seconds, false),
    onCompare: setCompared,
  });

  useEffect(() => {
    if (!selected) return;
    const now = performance.now();
    if (now - lastPresence.current < 100) return;
    lastPresence.current = now;
    let selection: RexSelection = null;
    if (region?.type === "REGION") {
      const geometry = region.geometry;
      if (geometry.kind === "POINT" || geometry.kind === "RECTANGLE") {
        selection = {
          kind: "REGION",
          x: geometry.x,
          y: geometry.y,
          w: geometry.kind === "RECTANGLE" ? geometry.width : null,
          h: geometry.kind === "RECTANGLE" ? geometry.height : null,
          page: region.page ?? null,
        };
      }
    } else if (region?.type === "WAVEFORM_RANGE") {
      selection = { kind: "WAVEFORM", startMs: region.startMs, endMs: region.endMs };
    }
    updatePresence({
      activeVersionId: selected.id,
      view: {
        playheadMs: Math.round(currentTime * 1000),
        selection,
        compareB: compareId,
      },
    });
  }, [compareId, currentTime, region, selected, updatePresence]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && followId !== null) setFollowId(null);
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (typing) return;
      const k = event.key.toLowerCase();
      if (k === "c") {
        if (compare) setCompareId(null);
        else if ((room.data?.versions.length ?? 0) > 1) setCompareDialogOpen(true);
      }
      // Annotation tool hotkeys (Figma-style): v select · b box · a arrow · d draw · p point · g polygon.
      const toolKeys: Record<string, AnnotationTool> = {
        v: "select",
        b: "box",
        a: "arrow",
        d: "draw",
        p: "point",
        g: "polygon",
      };
      if (toolKeys[k]) setTool(toolKeys[k]);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [followId, room.data?.versions, compare]);

  useEffect(() => {
    const completed = (event: Event) => {
      const detail = (event as CustomEvent<{ deliverableId: string }>).detail;
      if (detail.deliverableId !== deliverableId) return;
      void queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] });
      broadcastRoomEvent(roomId, {
        type: "INVALIDATE",
        queryKeys: [["review-room", deliverableId]],
      });
    };
    window.addEventListener("rexops:upload-complete", completed);
    return () => window.removeEventListener("rexops:upload-complete", completed);
  }, [deliverableId, queryClient, roomId]);

  useLiveRoomEvents(
    (event) => {
      if (event.type === "COMMENT_ADDED" && event.deliverableId === deliverableId) {
        queryClient.setQueryData<RoomData>(["review-room", deliverableId], (current) => {
          if (!current || current.comments.some((comment) => comment.id === event.comment.id))
            return current;
          return { ...current, comments: [...current.comments, event.comment as ReviewComment] };
        });
        return true;
      }
      if (event.type === "COMMENT_RESOLVED" && event.deliverableId === deliverableId) {
        queryClient.setQueryData<RoomData>(["review-room", deliverableId], (current) =>
          current
            ? {
                ...current,
                comments: current.comments.map((comment) =>
                  comment.id === event.commentId
                    ? { ...comment, resolvedAt: event.resolved ? new Date().toISOString() : null }
                    : comment,
                ),
              }
            : current,
        );
        return true;
      }
      if (event.type === "DECISION_MADE" || event.type === "VERSION_ADDED") return false;
      if (event.type === "REACTION_FLY") {
        const reaction = { id: crypto.randomUUID(), ...event };
        setLiveReactions((items) => [...items, reaction]);
        window.setTimeout(
          () => setLiveReactions((items) => items.filter((item) => item.id !== reaction.id)),
          1400,
        );
        return true;
      }
      return false;
    },
    [["review-room", deliverableId]],
  );

  const postComment = useMutation({
    mutationFn: async (input: {
      message: string;
      parentId?: string;
      attachmentIds?: string[];
      mentionUserIds?: string[];
      refVersionIds?: string[];
    }) => {
      if (!selected) throw new Error("Select a version.");
      return request<ReviewComment>(`/api/reviews/deliverables/${deliverableId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          fileVersionId: selected.id,
          message: input.message,
          parentId: input.parentId,
          visibility: clientMode ? "CLIENT_VISIBLE" : visibility,
          mentionUserIds: input.mentionUserIds ?? [],
          refVersionIds: input.refVersionIds ?? [],
          attachmentIds: input.attachmentIds ?? [],
          ...anchorPayload(region, currentTime, selected.fileType),
        }),
      });
    },
    onSuccess: async (comment) => {
      const hydrated: ReviewComment = {
        ...comment,
        authorName: myName,
        reactionRows: [],
        attachmentRows: [],
      };
      queryClient.setQueryData<RoomData>(["review-room", deliverableId], (current) =>
        current ? { ...current, comments: [...current.comments, hydrated] } : current,
      );
      broadcastRoomEvent(roomId, {
        type: "COMMENT_ADDED",
        deliverableId,
        versionId: selected?.id ?? "",
        comment: hydrated as unknown as JsonObject,
      });
      setMessage("");
      setRegion(null);
      setMentionUserIds([]);
      setRefVersionIds([]);
      setAttachmentIds([]);
      updatePresence({ isCommenting: false });
      await queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] });
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
      request(
        `/api/reviews/deliverables/${deliverableId}/comments/${commentId}/reactions${
          remove ? `/${encodeURIComponent(emoji)}` : ""
        }`,
        {
          method: remove ? "DELETE" : "POST",
          body: remove ? undefined : JSON.stringify({ emoji }),
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] }),
  });
  const resolve = useMutation({
    mutationFn: ({ commentId, reopen }: { commentId: string; reopen: boolean }) =>
      request(
        `/api/reviews/deliverables/${deliverableId}/comments/${commentId}/${
          reopen ? "reopen" : "resolve"
        }`,
        { method: "POST" },
      ),
    onSuccess: (_, variables) => {
      broadcastRoomEvent(roomId, {
        type: "COMMENT_RESOLVED",
        deliverableId,
        commentId: variables.commentId,
        resolved: !variables.reopen,
      });
      return queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] });
    },
  });
  const convert = useMutation({
    mutationFn: (commentId: string) =>
      request(`/api/reviews/deliverables/${deliverableId}/comments/${commentId}/task`, {
        method: "POST",
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] }),
        queryClient.invalidateQueries({ queryKey: ["revision-tasks", deliverableId] }),
      ]),
  });

  if (room.isError || room.isLoading || !room.data || !selected) {
    /* The old condition treated a failed load as "still loading" and span
     * forever, which is the worst possible answer to "is this broken or slow?". */
    const shell = room.isError ? (
      <div className="review-room-loading review-room-loading--failed">
        <Callout tone="danger" title="This review could not be opened">
          {(room.error as Error).message} It may have been archived, or your access to it may have
          changed.
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => room.refetch()}>
              Try opening it again
            </Button>
            <Link
              className="rx-button rx-button--secondary"
              to={clientMode ? "/client/home" : "/agency/work"}
            >
              {clientMode ? "Back to what needs you" : "Back to all work"}
            </Link>
          </div>
        </Callout>
      </div>
    ) : (
      <div className="review-room-loading">
        <LoaderCircle className="spin" size={28} /> Opening the review room…
      </div>
    );
    return clientMode ? <ClientShell>{shell}</ClientShell> : <AgencyShell>{shell}</AgencyShell>;
  }

  const content = (
    <div className="review-room">
      <header className="review-room__header">
        <div>
          <Link
            to={clientMode ? "/client/home" : "/agency/dashboard"}
            aria-label={clientMode ? "Back to what needs you" : "Back to your dashboard"}
            title={clientMode ? "Back to what needs you" : "Back to your dashboard"}
          >
            <ArrowLeft size={14} />
          </Link>
          <div>
            <span className="rx-eyebrow">
              {clientMode ? "Client review" : "Agency review"} · {selected.displayVersion}
            </span>
            <h1>{room.data.deliverable.title}</h1>
          </div>
        </div>
        <div>
          <PresenceAvatars following={followId} onFollow={setFollowId} />
          <StatusChip status={room.data.deliverable.status} />
          <Button
            variant="secondary"
            onClick={() => setAuditOpen(true)}
            title="Every version, comment, approval and status change on this work, with who did it and when"
          >
            <Gauge size={15} /> History
          </Button>
          {!clientMode ? (
            <Button variant="secondary" onClick={() => setShareOpen(true)}>
              <Share2 size={15} /> Share
            </Button>
          ) : null}
        </div>
      </header>
      {followed ? (
        <FollowBanner name={followed.info.name} onExit={() => setFollowId(null)} />
      ) : null}
      <div className="review-room__grid">
        <aside className="review-version-rail">
          <span className="rx-eyebrow">Versions</span>
          <VersionRail
            versions={room.data.versions}
            selectedId={selected.id}
            onSelect={selectVersion}
            pending={pendingUploads}
            onFiles={
              clientMode
                ? undefined
                : (files) =>
                    void enqueueUploads(files, {
                      deliverableId,
                      purpose: "VERSION",
                      versionBump: "MINOR",
                    })
            }
            draggable={!clientMode}
            viewerDots={(version) => <ViewerDots versionId={version.id} />}
          />
          {room.data.versions.length > 1 ? (
            <Button
              variant={compare ? "secondary" : "ghost"}
              onClick={() => (compare ? setCompareId(null) : setCompareDialogOpen(true))}
            >
              <Columns2 size={14} /> {compare ? "Exit compare" : "Compare"}
            </Button>
          ) : null}
        </aside>
        <main
          className="review-media"
          onDragOver={(event) => {
            if (!clientMode && event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            if (clientMode || !event.dataTransfer.files.length) return;
            event.preventDefault();
            void enqueueUploads([...event.dataTransfer.files], {
              deliverableId,
              purpose: "VERSION",
              versionBump: "MINOR",
            });
          }}
          onPointerDown={() => {
            if (followId !== null) setFollowId(null);
          }}
        >
          {compare ? (
            <div className="compare-toolbar">
              <div>
                <VersionPicker
                  versions={room.data.versions.filter((version) => version.id !== compare.id)}
                  selectedIds={[selected.id]}
                  multiple={false}
                  label={`A ${selected.displayVersion}`}
                  onChange={(ids) => ids[0] && selectVersion(ids[0])}
                />
                <VersionPicker
                  versions={room.data.versions.filter((version) => version.id !== selected.id)}
                  selectedIds={[compare.id]}
                  multiple={false}
                  label={`B ${compare.displayVersion}`}
                  onChange={(ids) => setCompareId(ids[0] ?? null)}
                />
              </div>
              <div className="segmented">
                {(["SIDE_BY_SIDE", "SPLIT", "ONION"] as CompareMode[]).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    data-active={compareMode === mode}
                    onClick={() => setCompareMode(mode)}
                  >
                    {mode.replaceAll("_", " ").toLowerCase()}
                  </button>
                ))}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setZoom((value) => ({ ...value, scale: Math.max(0.5, value.scale - 0.2) }))
                  }
                >
                  <ZoomOut size={13} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setZoom((value) => ({ ...value, scale: Math.min(4, value.scale + 0.2) }))
                  }
                >
                  <ZoomIn size={13} />
                </button>
                <button type="button" onClick={() => setZoom({ scale: 1, x: 0, y: 0 })}>
                  Fit
                </button>
              </div>
            </div>
          ) : null}
          {capabilities.canAnnotate &&
          mediumFromFileType(selected.fileType) !== "audio" &&
          mediumFromFileType(selected.fileType) !== "other" ? (
            <AnnotationToolbar
              medium={mediumFromFileType(selected.fileType)}
              tool={tool}
              onToolChange={setTool}
            />
          ) : null}
          <div className="review-media__canvas" data-compare={Boolean(compare)}>
            <CompareStage
              base={selected}
              against={compare}
              mode={compareMode}
              currentTime={currentTime}
              onTime={(value) => setTime(value)}
              onDuration={setDuration}
              zoom={zoom}
              onZoom={setZoom}
              tool={tool}
              activeAnnotationId={activeCommentId}
              annotationsA={annotationsA}
              annotationsB={annotationsB}
              onCreateA={setRegion}
              onCreateB={(anchor) => {
                if (compare) setSelectedVersionId(compare.id);
                setRegion(anchor);
              }}
              onActivate={setActiveCommentId}
              focusRef={viewerFocus}
            />
            <button
              type="button"
              className="reaction-fly-trigger"
              onClick={() => {
                const event = { type: "REACTION_FLY" as const, emoji: "👍", x: 0.5, y: 0.55 };
                broadcast(event);
              }}
              aria-label="Send a live thumbs up"
            >
              <Smile size={15} />
            </button>
            {liveReactions.map((reaction) => (
              <span
                className="reaction-fly"
                key={reaction.id}
                style={{ left: `${reaction.x * 100}%`, top: `${reaction.y * 100}%` }}
              >
                {reaction.emoji}
              </span>
            ))}
          </div>
          <div className="review-scrubber">
            <button
              type="button"
              onClick={() => {
                setFollowId(null);
                const media = document.querySelector<HTMLMediaElement>(
                  ".review-media__canvas video, .review-media__canvas audio",
                );
                if (media?.paused) void media.play();
                else media?.pause();
              }}
              aria-label="Play or pause"
            >
              {document.querySelector<HTMLMediaElement>(".review-media__canvas video")?.paused ===
              false ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
            </button>
            <span className="rx-mono">{timecode(currentTime * 1000)}</span>
            <div
              className="scrubber-track"
              role="slider"
              tabIndex={0}
              aria-label="Review playhead"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              onPointerMove={(event) => {
                if (!duration) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const percent = Math.max(
                  0,
                  Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100),
                );
                setHover({ percent, time: (percent / 100) * duration });
              }}
              onPointerLeave={() => setHover(null)}
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setTime(((event.clientX - bounds.left) / bounds.width) * duration);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") setTime(Math.max(0, currentTime - 1));
                if (event.key === "ArrowRight") setTime(Math.min(duration, currentTime + 1));
              }}
            >
              <i style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
              {selectedComments
                .map((comment) => ({
                  comment,
                  ms: anchorTimecodeMs(parseAnchor(comment.anchorType, comment.anchor)),
                }))
                .filter((entry) => entry.ms != null)
                .map(({ comment, ms }) => (
                  <button
                    type="button"
                    key={comment.id}
                    className="scrubber-marker"
                    data-resolved={Boolean(comment.resolvedAt)}
                    data-active={activeCommentId === comment.id}
                    style={{
                      left: `${duration ? ((ms as number) / 1000 / duration) * 100 : 0}%`,
                    }}
                    title={`${comment.authorName}: ${comment.message}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      focusAnchor(comment);
                    }}
                  />
                ))}
              <GhostPlayheads
                versionId={selected.id}
                duration={duration}
                onJump={(seconds) => setTime(seconds)}
              />
              {hover && sprite.data ? (
                <ScrubPreview
                  url={sprite.data.url}
                  hoverTime={hover.time}
                  positionPercent={hover.percent}
                  intervalMs={sprite.data.intervalMs}
                  columns={sprite.data.columns}
                  rows={sprite.data.rows}
                  cellWidth={sprite.data.cellWidth}
                  cellHeight={sprite.data.cellHeight}
                />
              ) : null}
            </div>
            <span className="rx-mono">{timecode(duration * 1000)}</span>
          </div>
          <DecisionBar
            capabilities={capabilities}
            status={room.data.deliverable.status}
            versionId={selected.id}
            deliverableId={deliverableId}
            roomId={roomId}
          />
        </main>
        <aside className="review-comments">
          <div className="review-comments__heading">
            <div>
              <span className="rx-eyebrow">Comments</span>
              <h2>{selected.displayVersion}</h2>
            </div>
            <span className="rx-mono">{String(selectedComments.length).padStart(2, "0")}</span>
          </div>
          <div className="comment-filters segmented">
            {(["OPEN", "RESOLVED", "MINE", "INTERNAL"] as const)
              .filter((filter) => !clientMode || filter !== "INTERNAL")
              .map((filter) => (
                <button
                  type="button"
                  key={filter}
                  data-active={commentFilter === filter}
                  onClick={() => setCommentFilter(filter)}
                >
                  {COMMENT_FILTER_LABELS[filter]}
                </button>
              ))}
          </div>
          <TypingIndicator kind="commenting" />
          <div className="review-comments__list">
            <CommentThread
              comments={selectedComments}
              myUserId={myUserId}
              clientMode={clientMode}
              filter={commentFilter}
              hashtag={hashtag}
              onHashtag={setHashtag}
              onReply={async (parentId, reply, replyAttachments) => {
                await postComment.mutateAsync({
                  message: reply,
                  parentId,
                  attachmentIds: replyAttachments,
                });
              }}
              onReact={(commentId, emoji, remove) => react.mutate({ commentId, emoji, remove })}
              onResolve={(commentId, reopen) => resolve.mutate({ commentId, reopen })}
              onConvert={(commentId) => convert.mutate(commentId)}
              onAnchor={focusAnchor}
              activeCommentId={activeCommentId}
            />
            {!selectedComments.length ? (
              <div className="comments-empty">
                <MessageSquareText size={22} />
                <span>No notes on this cut yet.</span>
              </div>
            ) : null}
          </div>
          <div className="comment-composer">
            {region ? (
              <span className="anchor-chip">
                {region.type === "WAVEFORM_RANGE" ? "Audio range pinned" : "Region pinned"}
                <button onClick={() => setRegion(null)} type="button">
                  <X size={12} />
                </button>
              </span>
            ) : selected.fileType?.startsWith("video/") ? (
              <span className="anchor-chip rx-mono">@ {timecode(currentTime * 1000)}</span>
            ) : null}
            <VersionChips
              versions={room.data.versions}
              selectedIds={refVersionIds}
              onRemove={(id) => setRefVersionIds((ids) => ids.filter((value) => value !== id))}
            />
            {attachmentIds.map((attachment) => (
              <span className="attachment-chip" key={attachment.id}>
                <Paperclip size={11} /> {attachment.name}
              </span>
            ))}
            <textarea
              value={message}
              onFocus={() => updatePresence({ isCommenting: true })}
              onBlur={() => updatePresence({ isCommenting: false })}
              onChange={(event) => {
                setMessage(event.target.value);
                if (event.target.value.endsWith("@")) setMentionOpen(true);
              }}
              placeholder="Leave precise feedback…"
            />
            {mentionOpen && !clientMode ? (
              <div className="mention-menu" role="listbox">
                {room.data.users.map((user) => (
                  <button
                    type="button"
                    key={user.id}
                    onClick={() => {
                      setMentionUserIds((ids) => [...new Set([...ids, user.id])]);
                      setMessage((value) => `${value}${user.name.replaceAll(" ", "")} `);
                      setMentionOpen(false);
                    }}
                  >
                    <span>{user.name.slice(0, 2).toUpperCase()}</span>
                    <strong>{user.name}</strong>
                    <small>{titleCase(user.role)}</small>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="comment-composer__toolbar">
              <div>
                {!clientMode ? (
                  <button type="button" onClick={() => setMentionOpen((value) => !value)}>
                    <Users size={13} /> Mention
                  </button>
                ) : null}
                <VersionPicker
                  versions={room.data.versions}
                  selectedIds={refVersionIds}
                  onChange={setRefVersionIds}
                />
                <button type="button" onClick={() => attachmentInput.current?.click()}>
                  <Paperclip size={13} /> Attach
                </button>
                <input
                  ref={attachmentInput}
                  type="file"
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setAttachmentPending(true);
                    try {
                      const id = await uploadAttachment(file);
                      setAttachmentIds((items) => [...items, { id, name: file.name }]);
                    } finally {
                      setAttachmentPending(false);
                    }
                  }}
                />
              </div>
              {!clientMode ? (
                <label>
                  <input
                    type="checkbox"
                    checked={visibility === "INTERNAL"}
                    onChange={(event) =>
                      setVisibility(event.target.checked ? "INTERNAL" : "CLIENT_VISIBLE")
                    }
                  />
                  Agency only
                </label>
              ) : (
                <span>Visible to the agency</span>
              )}
              <button
                type="button"
                disabled={!message.trim() || postComment.isPending || attachmentPending}
                onClick={() =>
                  postComment.mutate({
                    message,
                    attachmentIds: attachmentIds.map((attachment) => attachment.id),
                    mentionUserIds,
                    refVersionIds,
                  })
                }
                aria-label="Post comment"
              >
                {attachmentPending ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>
      {auditOpen ? (
        <div className="audit-drawer">
          <button
            type="button"
            onClick={() => setAuditOpen(false)}
            aria-label="Close approval trail"
          />
          <section aria-label="Approval trail">
            <header>
              <div>
                <span className="rx-eyebrow">Compliant record</span>
                <h2>Approval trail</h2>
              </div>
              <button type="button" onClick={() => setAuditOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <StageTimeline runs={room.data.runs} approvals={room.data.approvals} />
          </section>
        </div>
      ) : null}
      {shareOpen ? (
        <ShareDialog
          deliverableId={deliverableId}
          versionId={selected.id}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      {compareDialogOpen ? (
        <CompareDialog
          versions={room.data.versions}
          defaultA={selected.id}
          defaultMode={compareMode}
          onConfirm={({ a, b, mode }) => {
            selectVersion(a);
            setCompareId(b);
            setCompareMode(mode);
            setCompareDialogOpen(false);
          }}
          onClose={() => setCompareDialogOpen(false)}
        />
      ) : null}
    </div>
  );

  return clientMode ? <ClientShell>{content}</ClientShell> : <AgencyShell>{content}</AgencyShell>;
}

function ShareDialog({
  deliverableId,
  versionId,
  onClose,
}: {
  deliverableId: string;
  versionId: string;
  onClose(): void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [url, setUrl] = useState("");
  const share = useMutation({
    mutationFn: () =>
      request<{ url: string }>("/api/shares", {
        method: "POST",
        body: JSON.stringify({
          resourceType: "FILE_VERSION",
          resourceId: versionId,
          passphrase: passphrase || undefined,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          allowComment: true,
          allowDownload,
          watermark: watermark ? "STANDARD" : "NONE",
          audience: "GUEST",
        }),
      }),
    onSuccess: (data) => setUrl(data.url),
  });
  return (
    <div className="review-dialog">
      <button
        type="button"
        className="review-dialog__backdrop"
        onClick={onClose}
        aria-label="Close share"
      />
      <section>
        <div>
          <span className="rx-eyebrow">Controlled review link</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <h2>Share this exact cut.</h2>
        {url ? (
          <div className="share-result">
            <Link2 size={20} />
            <input readOnly value={url} />
            <Button onClick={() => navigator.clipboard.writeText(url)}>Copy link</Button>
          </div>
        ) : (
          <>
            <label>
              Passphrase <span>optional</span>
              <input
                type="password"
                value={passphrase}
                minLength={6}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="At least 6 characters"
              />
            </label>
            <label className="share-check">
              <input
                type="checkbox"
                checked={allowDownload}
                onChange={(event) => setAllowDownload(event.target.checked)}
              />
              Allow source download
            </label>
            <label className="share-check">
              <input
                type="checkbox"
                checked={watermark}
                onChange={(event) => setWatermark(event.target.checked)}
              />
              Standard visible watermark
            </label>
            <small>Expires in 7 days · comments enabled · scoped to {deliverableId}</small>
            <Button disabled={share.isPending} onClick={() => share.mutate()}>
              <Share2 size={15} /> Create review link
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
