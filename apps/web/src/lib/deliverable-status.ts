/**
 * Client-side mirror of the review state machine in
 * `packages/core/src/review/state-machine.ts`, used only to decide which moves a
 * deliverable can make next. The server re-validates every transition and answers
 * an illegal one with 409, so this table is a UI convenience — not an authority.
 * Keep it in step with core when the machine changes.
 *
 * Every legal move also carries the words for it. The screen used to render one
 * identical "Move to X" button per transition, which made "approve it internally"
 * and "archive it" look like the same kind of decision, and named neither the
 * action nor who would see the result.
 */

export type TransitionInfo = {
  to: string;
  /** Names the action and its result. Never "Move to INTERNAL_APPROVED". */
  label: string;
  /** What actually happens, and to whom, once it is done. */
  result: string;
  /** `primary` is the expected next step; `danger` needs confirming. */
  weight: "primary" | "secondary" | "danger";
};

const ARCHIVE: TransitionInfo = {
  to: "ARCHIVED",
  label: "Archive this deliverable",
  result:
    "It disappears from your slate and from the client's portal. Files, comments and approvals are kept, and an owner or admin can bring it back.",
  weight: "danger",
};

const TRANSITIONS: Record<string, readonly TransitionInfo[]> = {
  PENDING: [
    {
      to: "IN_PROGRESS",
      label: "Start work on this",
      result: "Marks it as being worked on. Nobody outside your team is notified.",
      weight: "primary",
    },
    ARCHIVE,
  ],
  IN_PROGRESS: [
    {
      to: "READY_FOR_INTERNAL_REVIEW",
      label: "Hand it to your team to review",
      result: "It joins your review queue. The client still cannot see it.",
      weight: "primary",
    },
    ARCHIVE,
  ],
  READY_FOR_INTERNAL_REVIEW: [
    {
      to: "UNDER_INTERNAL_REVIEW",
      label: "Start the internal review",
      result: "Tells your team that someone has picked it up and is going through it.",
      weight: "primary",
    },
    ARCHIVE,
  ],
  UNDER_INTERNAL_REVIEW: [
    {
      to: "INTERNAL_APPROVED",
      label: "Approve it internally",
      result:
        "Your team signs off. It is still not with the client — sending it on is a separate step.",
      weight: "primary",
    },
    {
      to: "IN_PROGRESS",
      label: "Send it back to be worked on",
      result: "Returns it to the editor. Any comments you left stay attached to this version.",
      weight: "secondary",
    },
    ARCHIVE,
  ],
  INTERNAL_APPROVED: [
    {
      to: "UNDER_CLIENT_REVIEW",
      label: "Send it to the client",
      result: "The client can open this version, comment on it and approve it. They are notified.",
      weight: "primary",
    },
    ARCHIVE,
  ],
  UNDER_CLIENT_REVIEW: [
    {
      to: "APPROVED",
      label: "Record the client's approval",
      result:
        "Signs this exact version off against your name and the time. Use it when the client approved outside RexOps.",
      weight: "primary",
    },
    {
      to: "REVISION_REQUESTED",
      label: "Send it back for changes",
      result: "Marks it as needing another cut. It returns to your team's slate.",
      weight: "secondary",
    },
    ARCHIVE,
  ],
  REVISION_REQUESTED: [
    {
      to: "READY_FOR_INTERNAL_REVIEW",
      label: "Hand the new cut to your team",
      result: "Puts it back in your own review queue before the client sees it again.",
      weight: "primary",
    },
    {
      to: "UNDER_CLIENT_REVIEW",
      label: "Send it straight back to the client",
      result: "Skips internal review. The client sees the latest version immediately.",
      weight: "secondary",
    },
    ARCHIVE,
  ],
  APPROVED: [
    {
      to: "DELIVERED",
      label: "Mark it as delivered",
      result: "Records that the final file has gone out. This is the end of the pipeline.",
      weight: "primary",
    },
    {
      to: "REVISION_REQUESTED",
      label: "Reopen it for changes",
      result: "Undoes the sign-off for new work. The approval stays in the record.",
      weight: "secondary",
    },
    ARCHIVE,
  ],
  DELIVERED: [ARCHIVE],
  ARCHIVED: [],
};

/** Every move this deliverable can legally make next, in the order to offer them. */
export function nextSteps(from: string | undefined): TransitionInfo[] {
  return from ? [...(TRANSITIONS[from] ?? [])] : [];
}

export function allowedTransitions(from: string | undefined) {
  return nextSteps(from).map((step) => step.to);
}

/**
 * What the current stage means in the workflow: who is holding it, and what the
 * people who can see it are expected to do. The status chip alone says the name
 * of a state, not what is true because of it.
 */
const MEANINGS: Record<string, string> = {
  PENDING: "Nobody has started on this yet. It is not visible to the client.",
  IN_PROGRESS: "Your team is making it. Nothing has been sent for review.",
  READY_FOR_INTERNAL_REVIEW:
    "Waiting for someone on your own team to review it. The client cannot see it.",
  UNDER_INTERNAL_REVIEW: "Your team is reviewing it now. The client still cannot see it.",
  INTERNAL_APPROVED:
    "Your team has signed off, but the client has not been sent it yet. That is the next step.",
  UNDER_CLIENT_REVIEW: "The client can see this version and is deciding. You are waiting on them.",
  REVISION_REQUESTED: "Someone asked for changes. Your team owes a new version.",
  APPROVED: "Signed off against this exact version. Only delivery is left.",
  DELIVERED: "The final file has gone out. Nothing else is expected.",
  ARCHIVED: "Hidden from the slate and from the client's portal. Nothing has been deleted.",
};

export function stageMeaning(status: string | undefined) {
  return status ? (MEANINGS[status] ?? "") : "";
}
