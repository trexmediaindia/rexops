import type { PermissionFlags, Specialty, UserRole } from "@rexops/config";

export type Principal = {
  userId: string;
  role: UserRole;
  specialty: Specialty | null;
  agencyId: string | null;
  clientId: string | null;
  permissions: PermissionFlags;
  impersonating?: boolean;
};

export type TenantRow = {
  agencyId: string;
  clientId?: string | null;
  deletedAt?: Date | null;
};

export type Resource =
  | "agency"
  | "client"
  | "project"
  | "deliverable"
  | "fileVersion"
  | "comment"
  | "member"
  | "settings"
  | "automation"
  | "share";

export type Action = "create" | "read" | "update" | "delete" | "approve" | "invite";
