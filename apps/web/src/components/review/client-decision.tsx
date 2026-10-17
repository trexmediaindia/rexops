import { Button, Callout } from "@rexops/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, CheckCircle2, Clock, MessageSquareText, X } from "lucide-react";
import { useState } from "react";
import { broadcastInvalidation, broadcastRoomEvent } from "../../lib/realtime";
import { request } from "../../lib/request";
import type { ReviewCapabilities } from "./review-session";

type Decision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";

/** Stored with a signed client approval. Same wording and version the API has on record. */
export const SIGNATURE_CONSENT = "I confirm that I am authorized to approve this version.";
export const SIGNATURE_CONSENT_VERSION = "2026-06-22";

/**
 * The client's side of the decision bar. The agency bar offers three equally weighted
 * buttons and a form with a consent statement, a signature box and a note "for the
 * record". A client opening this from a WhatsApp link has a minute: they need one
 * obvious way to say yes, one to say "change this", and nothing else in the way.
 */
export function ClientDecisionBar({
  capabilities,
  status,
  versionId,
  deliverableId,
  roomId,
  title,
  myName,
}: {
  capabilities: ReviewCapabilities;
  status: string;
  versionId: string;
  deliverableId: string;
  roomId: string;
  title: string;
  myName: string;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const requiresSignature = capabilities.decision.requiresESignature;

  const action = useMutation({
    mutationFn: (chosen: Decision) =>
      request(`/api/reviews/deliverables/${deliverableId}/decisions`, {
        method: "POST",
        body: JSON.stringify({
          fileVersionId: versionId,
          decision: chosen,
          feedback: note.trim() || undefined,
          eSignature: chosen === "APPROVE" ? name.trim() || undefined : undefined,
          signatureConsentText:
            chosen === "APPROVE" && requiresSignature ? SIGNATURE_CONSENT : undefined,
          signatureConsentVersion:
            chosen === "APPROVE" && requiresSignature ? SIGNATURE_CONSENT_VERSION : undefined,
        }),
      }),
    onSuccess: async (_, chosen) => {
      setDecision(null);
      setNote("");
      setNoteOpen(false);
      broadcastRoomEvent(roomId, {
        type: "DECISION_MADE",
        deliverableId,
        versionId,
        decision: chosen,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] }),
        queryClient.invalidateQueries({ queryKey: ["client-deliverables"] }),
        queryClient.invalidateQueries({ queryKey: ["client-projects"] }),
      ]);
      broadcastInvalidation({ room: roomId, queryKeys: [["review-room", deliverableId]] });
    },
  });

  function open(chosen: Decision) {
    action.reset();
    setNote("");
    setNoteOpen(false);
    if (chosen === "APPROVE") setName(myName);
    setDecision(chosen);
  }

  if (!capabilities.decision.canApprove) {
    return <ClientDecisionStatus status={status} code={capabilities.decision.blockedCode} />;
  }

  if (!decision) {
    return (
      <div className="client-decision">
        <p className="client-decision__ask">Happy with it?</p>
        <div className="client-decision__buttons">
          <Button onClick={() => open("APPROVE")}>
            <Check size={17} /> Approve
          </Button>
          <Button variant="secondary" onClick={() => open("REQUEST_CHANGES")}>
            <MessageSquareText size={17} /> Ask for changes
          </Button>
        </div>
        <button type="button" className="client-decision__reject" onClick={() => open("REJECT")}>
          Not right at all? Reject it
        </button>
      </div>
    );
  }

  const copy = {
    APPROVE: {
      heading: `Approve “${title}”`,
      confirm: "Approve",
      pending: "Approving…",
    },
    REQUEST_CHANGES: {
      heading: "What should we change?",
      confirm: "Send to the agency",
      pending: "Sending…",
    },
    REJECT: {
      heading: "Reject this version?",
      confirm: "Reject it",
      pending: "Sending…",
    },
  }[decision];

  const missing =
    decision === "APPROVE" ? requiresSignature && name.trim().length < 2 : note.trim().length === 0;

  return (
    <form
      className="client-decision client-decision--form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!missing) action.mutate(decision);
      }}
    >
      <header>
        <strong>{copy.heading}</strong>
        <button type="button" onClick={() => setDecision(null)} aria-label="Go back">
          <X size={16} />
        </button>
      </header>

      {decision === "APPROVE" ? (
        <>
          {requiresSignature ? (
            <label>
              Your name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          ) : null}
          {noteOpen ? (
            <label>
              Note <span>optional</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Anything you'd like to add"
              />
            </label>
          ) : (
            <button
              type="button"
              className="client-decision__link"
              onClick={() => setNoteOpen(true)}
            >
              + Add a note
            </button>
          )}
        </>
      ) : (
        <label>
          {decision === "REJECT" ? "Tell us why" : "Your feedback"}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            required
            placeholder={
              decision === "REJECT"
                ? "e.g. This isn't what we briefed. We wanted a product shot, not a lifestyle one."
                : "e.g. Make the logo bigger and use the blue from our brand guide."
            }
          />
          <small>
            {decision === "REJECT"
              ? "Use this when it needs a fresh start, not just a few changes."
              : "Any comments you've left on the work are sent along with this."}
          </small>
        </label>
      )}

      {action.error ? (
        <Callout tone="danger" title="That didn't go through">
          {action.error.message} Please try again.
        </Callout>
      ) : null}

      <Button type="submit" disabled={action.isPending || missing}>
        {action.isPending ? copy.pending : copy.confirm}
      </Button>
      {decision === "APPROVE" && requiresSignature ? (
        <small className="client-decision__fineprint">
          By approving, you confirm you're allowed to sign this off. Your name and today's date are
          saved with your approval.
        </small>
      ) : null}
    </form>
  );
}

/** What the client sees when no decision is being asked of them, in their words. */
function ClientDecisionStatus({
  status,
  code,
}: {
  status: string;
  code: ReviewCapabilities["decision"]["blockedCode"];
}) {
  if (status === "APPROVED" || status === "DELIVERED") {
    return (
      <div className="client-decision client-decision--done">
        <CheckCircle2 size={20} aria-hidden="true" />
        <p>You approved this.</p>
        <Link className="client-decision__link" to="/client/approved">
          Download the files <ArrowRight size={14} />
        </Link>
      </div>
    );
  }
  if (status === "REVISION_REQUESTED") {
    return (
      <div className="client-decision client-decision--done">
        <Clock size={20} aria-hidden="true" />
        <p>You asked for changes. The new version will appear here when it's ready.</p>
      </div>
    );
  }
  const message =
    code === "ALREADY_DECIDED"
      ? "Thanks, your decision is saved. We'll take it from here."
      : code === "NOT_YOUR_TURN"
        ? "Someone else at your company approves this first. You'll be able to approve after them."
        : code === "NOT_APPROVER" || code === "NO_PERMISSION"
          ? "You can comment on this. Approving is done by someone else at your company."
          : code === "QUORUM_MET"
            ? "This has already been approved by your team."
            : "This isn't ready for your review yet.";
  return (
    <div className="client-decision client-decision--done">
      <Clock size={20} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
