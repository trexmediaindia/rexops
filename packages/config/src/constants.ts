export const USER_ROLES = [
  "SUPER_ADMIN",
  "AGENCY_OWNER",
  "AGENCY_ADMIN",
  "AGENCY_MEMBER",
  "CLIENT_OWNER",
  "CLIENT_MEMBER",
] as const;

export const SPECIALTIES = [
  "EDITOR",
  "MOTION",
  "DESIGNER",
  "PHOTOGRAPHER",
  "PM",
  "ACCOUNT",
  "GENERAL",
] as const;

export const CONTENT_TYPES = ["MOTION", "STATIC", "OTHER"] as const;

export const DELIVERABLE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "INTERNAL_APPROVED",
  "UNDER_CLIENT_REVIEW",
  "REVISION_REQUESTED",
  "APPROVED",
  "DELIVERED",
  "ARCHIVED",
] as const;

export const PROJECT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "IN_PROGRESS",
  "WAITING_FOR_CLIENT",
  "COMPLETED",
  "ARCHIVED",
] as const;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type Specialty = (typeof SPECIALTIES)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export const DEFAULT_PERMISSION_FLAGS = {
  canApprove: false,
  canInviteClients: false,
  canManageTeam: false,
  canUploadFinal: false,
  canViewAllClients: false,
  canManageAutomations: false,
} as const;

export type PermissionFlags = {
  [Key in keyof typeof DEFAULT_PERMISSION_FLAGS]: boolean;
};
