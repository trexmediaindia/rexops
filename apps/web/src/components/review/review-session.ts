// ReviewSession capabilities — resolves what the *authenticated* viewer may do, from
// their real role + their membership in the currently-active review stage. This replaces
// the old "clientMode (from the URL) + status string" gate that leaked the Approve button
// onto the agency screen for any viewer. See docs/16-deliverables-review-room-revamp.md §11.

import type { Approval, ReviewRun } from "./audit/stage-timeline";

export type ReviewSide = "AGENCY" | "CLIENT" | "GUEST";

type ReviewStage = ReviewRun["stages"][number];

export type DecisionCapability = {
  canApprove: boolean;
  canRequestChanges: boolean;
  canReject: boolean;
  requiresESignature: boolean;
  /**
   * Why this viewer cannot decide, in words they can act on. The room used to say
   * "No decision is required at this stage" to everyone, which reads as "nothing
   * is happening" when the truth is usually "it is not your turn" or "you are not
   * on the approver list".
   */
  blockedReason: string | null;
};

export type ReviewCapabilities = {
  side: ReviewSide;
  canComment: boolean;
  canAnnotate: boolean;
  canCompare: boolean;
  canShare: boolean;
  canSeeInternal: boolean;
  activeStage: ReviewStage | null;
  isApproverOnActiveStage: boolean;
  decision: DecisionCapability;
};

export function sideFromRole(role: string | null | undefined, isShare = false): ReviewSide {
  if (isShare) return "GUEST";
  if (role && role.startsWith("CLIENT_")) return "CLIENT";
  return "AGENCY";
}

// The single active stage across all review runs (the one currently awaiting a decision).
export function findActiveStage(runs: ReviewRun[]): ReviewStage | null {
  for (const run of runs) {
    const active = run.stages.find((stage) => stage.status === "ACTIVE");
    if (active) return active;
  }
  return null;
}

export function resolveCapabilities(args: {
  role: string | null | undefined;
  userId: string;
  isShare?: boolean;
  runs: ReviewRun[];
  approvals: Approval[];
  // Server-side fine-grained permission; defaults to true (the server re-checks on POST).
  canApprovePermission?: boolean;
  // Guest share grants (from the share link), used only when isShare.
  shareGrants?: { allowComment: boolean; allowDownload: boolean };
}): ReviewCapabilities {
  const isShare = args.isShare ?? false;
  const side = sideFromRole(args.role, isShare);
  const activeStage = findActiveStage(args.runs);

  const sideMatchesStage =
    activeStage != null &&
    ((side === "AGENCY" && activeStage.type === "INTERNAL") ||
      (side === "CLIENT" && activeStage.type === "CLIENT"));

  const stageDecisions = activeStage
    ? args.approvals.filter((a) => a.reviewStageId === activeStage.id)
    : [];
  const myApprover = activeStage?.approvers.find((a) => a.userId === args.userId) ?? null;
  const alreadyDecided = stageDecisions.some((a) => a.decidedByUserId === args.userId);
  const quorumMet =
    activeStage != null &&
    stageDecisions.filter((a) => a.decision === "APPROVE").length >= activeStage.requiredCount;

  // For SEQUENTIAL stages it must be this approver's turn (lowest undecided approverOrder).
  const myTurn = (() => {
    if (!activeStage || !myApprover) return false;
    if (activeStage.mode === "PARALLEL") return true;
    const undecidedOrders = activeStage.approvers
      .filter((a) => !stageDecisions.some((d) => d.decidedByUserId === a.userId))
      .map((a) => a.approverOrder);
    if (undecidedOrders.length === 0) return false;
    return Math.min(...undecidedOrders) === myApprover.approverOrder;
  })();

  const hasExplicitApprovers = (activeStage?.approvers.length ?? 0) > 0;
  const canApprovePermission = args.canApprovePermission ?? true;

  // Eligibility: when a stage names approvers, require membership + turn + open quorum.
  // When it names none (the degenerate single-approver default chain), fall back to a
  // side-match + permission check so the default internal/client gate still works.
  const eligible = sideMatchesStage
    ? hasExplicitApprovers
      ? Boolean(myApprover) && !alreadyDecided && !quorumMet && myTurn
      : canApprovePermission
    : false;

  const isApproverOnActiveStage = eligible;
  const canDecide = isApproverOnActiveStage && side !== "GUEST";

  const blockedReason = (() => {
    if (canDecide) return null;
    if (side === "GUEST") {
      return "You are here through a share link. Share links can read and comment, but approving has to be done by someone signed in.";
    }
    if (!activeStage) {
      return "Nothing is waiting on a decision yet. A decision is asked for once this cut has been sent for review.";
    }
    if (!sideMatchesStage) {
      return activeStage.type === "INTERNAL"
        ? "The agency is still reviewing this internally. It reaches you for a decision once they have finished."
        : "This is with the client now. The next decision is theirs, so there is nothing for you to approve here.";
    }
    if (hasExplicitApprovers && !myApprover) {
      const names = activeStage.approvers.length;
      return `You are not named as an approver on this stage, so your comments count but your approval is not asked for. ${names} ${names === 1 ? "person is" : "people are"} named on it.`;
    }
    if (alreadyDecided) {
      return "You have already given your decision on this stage. It is recorded and cannot be changed from here.";
    }
    if (quorumMet) {
      return "Enough approvals have already been given on this stage, so no further decision is needed.";
    }
    if (!myTurn) {
      return "Approvals on this stage happen in order, and it is not your turn yet. You will be able to decide once the people before you have.";
    }
    return "Your account can comment here but not approve. An owner or admin in your workspace can change that.";
  })();

  return {
    side,
    canComment: side !== "GUEST" || (args.shareGrants?.allowComment ?? false),
    canAnnotate: side !== "GUEST" || (args.shareGrants?.allowComment ?? false),
    canCompare: true,
    canShare: side === "AGENCY",
    canSeeInternal: side === "AGENCY",
    activeStage,
    isApproverOnActiveStage,
    decision: {
      canApprove: canDecide,
      canRequestChanges: canDecide,
      canReject: canDecide,
      requiresESignature: side === "CLIENT" && activeStage?.type === "CLIENT",
      blockedReason,
    },
  };
}
