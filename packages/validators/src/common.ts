import {
  CONTENT_TYPES,
  DELIVERABLE_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  SPECIALTIES,
  USER_ROLES,
} from "@rexops/config";
import { z } from "zod";

export const idSchema = z.string().min(1).max(128);
export const userRoleSchema = z.enum(USER_ROLES);
export const specialtySchema = z.enum(SPECIALTIES);
export const contentTypeSchema = z.enum(CONTENT_TYPES);
export const prioritySchema = z.enum(PRIORITIES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const deliverableStatusSchema = z.enum(DELIVERABLE_STATUSES);
export const dateInputSchema = z.iso.datetime().or(z.coerce.date()).optional();

export const permissionFlagsSchema = z.object({
  canApprove: z.boolean().default(false),
  canInviteClients: z.boolean().default(false),
  canManageTeam: z.boolean().default(false),
  canUploadFinal: z.boolean().default(false),
  canViewAllClients: z.boolean().default(false),
  canManageAutomations: z.boolean().default(false),
});
