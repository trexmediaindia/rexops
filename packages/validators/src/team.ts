import { z } from "zod";
import { permissionFlagsSchema, specialtySchema } from "./common";

/** Roles a roster row on the Team screen may hold. Client roles are managed from
 * the clients screen, so they are deliberately not assignable here. */
export const agencyRoleSchema = z.enum(["AGENCY_OWNER", "AGENCY_ADMIN", "AGENCY_MEMBER"]);

export const inviteTeamMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  role: agencyRoleSchema.default("AGENCY_MEMBER"),
  specialty: specialtySchema.default("GENERAL"),
  permissions: permissionFlagsSchema.partial().optional(),
});

export const updateTeamMemberSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: agencyRoleSchema.optional(),
    specialty: specialtySchema.optional(),
    permissions: permissionFlagsSchema.partial().optional(),
    banned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export type AgencyRole = z.infer<typeof agencyRoleSchema>;
export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
