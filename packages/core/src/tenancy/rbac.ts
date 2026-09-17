import type { Action, Principal, Resource } from "./types";

const all = ["create", "read", "update", "delete", "approve", "invite"] as const;
const readOnly = ["read"] as const;

const accessByRole = {
  SUPER_ADMIN: {
    agency: all,
    client: readOnly,
    project: readOnly,
    deliverable: readOnly,
    fileVersion: readOnly,
    comment: readOnly,
    member: readOnly,
    settings: readOnly,
    automation: readOnly,
    share: readOnly,
  },
  AGENCY_OWNER: {
    agency: readOnly,
    client: all,
    project: all,
    deliverable: all,
    fileVersion: all,
    comment: all,
    member: all,
    settings: all,
    automation: all,
    share: all,
  },
  AGENCY_ADMIN: {
    agency: readOnly,
    client: all,
    project: all,
    deliverable: all,
    fileVersion: all,
    comment: all,
    member: all,
    settings: all,
    automation: all,
    share: all,
  },
  AGENCY_MEMBER: {
    agency: readOnly,
    client: ["read", "create", "update"],
    project: ["read", "create", "update"],
    deliverable: ["read", "create", "update"],
    fileVersion: ["read", "create", "update"],
    comment: ["read", "create", "update"],
    member: ["read"],
    settings: readOnly,
    automation: readOnly,
    share: ["read", "create"],
  },
  CLIENT_OWNER: {
    agency: [],
    client: ["read", "invite"],
    project: readOnly,
    deliverable: ["read", "approve"],
    fileVersion: readOnly,
    comment: ["read", "create", "update"],
    member: [],
    settings: [],
    automation: [],
    share: ["read", "create"],
  },
  CLIENT_MEMBER: {
    agency: [],
    client: readOnly,
    project: readOnly,
    deliverable: ["read"],
    fileVersion: readOnly,
    comment: ["read", "create", "update"],
    member: [],
    settings: [],
    automation: [],
    share: [],
  },
} satisfies Record<Principal["role"], Record<Resource, readonly Action[]>>;

export function can(principal: Principal, action: Action, resource: Resource): boolean {
  const allowedActions = accessByRole[principal.role][resource] as readonly Action[];
  if (allowedActions.includes(action)) {
    if (principal.role !== "AGENCY_MEMBER" && principal.role !== "CLIENT_MEMBER") return true;

    if (action === "approve") return principal.permissions.canApprove;
    if (action === "invite" && resource === "member") return principal.permissions.canManageTeam;
    if (action === "invite" && resource === "client") return principal.permissions.canInviteClients;
    if (resource === "automation" && action !== "read") {
      return principal.permissions.canManageAutomations;
    }
    if (resource === "client" && action !== "read") return principal.permissions.canViewAllClients;
    return true;
  }
  if (resource === "deliverable" && action === "approve") return principal.permissions.canApprove;
  if (resource === "member" && action === "invite") return principal.permissions.canManageTeam;
  if (resource === "client" && action === "invite") return principal.permissions.canInviteClients;
  if (resource === "automation" && action !== "read") {
    return principal.permissions.canManageAutomations;
  }
  return false;
}
