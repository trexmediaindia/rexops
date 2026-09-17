import type { Principal } from "./types";

export type VisibleFileVersion = {
  visibility: "INTERNAL" | "CLIENT";
  [key: string]: unknown;
};

export type VisibleComment = {
  visibility: "INTERNAL" | "CLIENT_VISIBLE";
  [key: string]: unknown;
};

export function canSeeInternal(principal: Principal) {
  return principal.role === "SUPER_ADMIN" || principal.role.startsWith("AGENCY_");
}

export function visibleVersions<T extends VisibleFileVersion>(
  principal: Principal,
  versions: readonly T[],
): T[] {
  return canSeeInternal(principal)
    ? [...versions]
    : versions.filter((version) => version.visibility === "CLIENT");
}

export function visibleComments<T extends VisibleComment>(
  principal: Principal,
  comments: readonly T[],
): T[] {
  return canSeeInternal(principal)
    ? [...comments]
    : comments.filter((comment) => comment.visibility === "CLIENT_VISIBLE");
}

export function stripInternalDeliverableFields<T extends Record<string, unknown>>(
  principal: Principal,
  deliverable: T,
): T | Omit<T, "agencyNote"> {
  if (canSeeInternal(principal)) return deliverable;
  const { agencyNote: _agencyNote, ...safe } = deliverable;
  return safe;
}
