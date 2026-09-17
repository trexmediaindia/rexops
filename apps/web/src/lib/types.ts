/**
 * Wire shapes for the records the agency screens read from the JSON API.
 *
 * These mirror the Drizzle tables in `@rexops/db`, with one deliberate
 * difference: every `timestamp` column arrives as an ISO string over JSON, so
 * the date fields are typed `string | null` rather than `Date`.
 */

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ClientRecord = {
  id: string;
  agencyId: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  portalSlug: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  agencyId: string;
  clientId: string;
  parentProjectId: string | null;
  name: string;
  description: string | null;
  brief: string | null;
  type: string | null;
  status: string;
  priority: Priority;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliverableRecord = {
  id: string;
  agencyId: string;
  clientId: string;
  projectId: string;
  contentType: "MOTION" | "STATIC" | "OTHER";
  title: string;
  description: string | null;
  status: string;
  priority: Priority;
  assignedToUserId: string | null;
  dueDate: string | null;
  agencyNote: string | null;
  clientNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgencyRecord = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserSummary = {
  id: string;
  name: string;
  email: string;
};

export type PermissionFlags = {
  canApprove: boolean;
  canInviteClients: boolean;
  canManageTeam: boolean;
  canUploadFinal: boolean;
  canViewAllClients: boolean;
  canManageAutomations: boolean;
};

export type AgencyRole = "AGENCY_OWNER" | "AGENCY_ADMIN" | "AGENCY_MEMBER";

export type Specialty =
  | "EDITOR"
  | "MOTION"
  | "DESIGNER"
  | "PHOTOGRAPHER"
  | "PM"
  | "ACCOUNT"
  | "GENERAL";

/** A row on the agency roster. `openDeliverables` and `projectCount` are
 * aggregated server-side, so they are read-only here. */
export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: AgencyRole;
  specialty: Specialty | null;
  permissions: PermissionFlags;
  banned: boolean;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  openDeliverables: number;
  projectCount: number;
};

/** The invite response carries the one-time password the inviter hands over. */
export type InvitedTeamMember = TeamMember & { temporaryPassword: string };

export type StorageUsage = {
  usedBytes: number;
  quotaBytes: number;
  versionBytes: number;
  attachmentBytes: number;
  versionCount: number;
  attachmentCount: number;
};
