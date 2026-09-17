import type { DeliverableStatus } from "@rexops/config";

const transitions: Record<DeliverableStatus, readonly DeliverableStatus[]> = {
  PENDING: ["IN_PROGRESS", "ARCHIVED"],
  IN_PROGRESS: ["READY_FOR_INTERNAL_REVIEW", "ARCHIVED"],
  READY_FOR_INTERNAL_REVIEW: ["UNDER_INTERNAL_REVIEW", "ARCHIVED"],
  UNDER_INTERNAL_REVIEW: ["IN_PROGRESS", "INTERNAL_APPROVED", "ARCHIVED"],
  INTERNAL_APPROVED: ["UNDER_CLIENT_REVIEW", "ARCHIVED"],
  UNDER_CLIENT_REVIEW: ["REVISION_REQUESTED", "APPROVED", "ARCHIVED"],
  REVISION_REQUESTED: ["READY_FOR_INTERNAL_REVIEW", "UNDER_CLIENT_REVIEW", "ARCHIVED"],
  APPROVED: ["REVISION_REQUESTED", "DELIVERED", "ARCHIVED"],
  DELIVERED: ["ARCHIVED"],
  ARCHIVED: [],
};

export class InvalidTransitionError extends Error {
  readonly status = 409;

  constructor(from: DeliverableStatus, to: DeliverableStatus) {
    super(`Cannot transition deliverable from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: DeliverableStatus, to: DeliverableStatus) {
  return transitions[from].includes(to);
}

export function transitionDeliverable(from: DeliverableStatus, to: DeliverableStatus) {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return to;
}

export function allowedTransitions(from: DeliverableStatus) {
  return [...transitions[from]];
}
