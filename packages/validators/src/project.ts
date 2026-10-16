import { z } from "zod";
import { prioritySchema, projectStatusSchema, serviceTypeSchema } from "./common";

/* Fields without defaults. Updates are built from these: a `.default()` inside a partial
   schema still fires in zod 4, so building updates from the create schema used to reset
   priority (and would reset the service) on every edit that didn't mention them. */
const projectFields = {
  clientId: z.string().min(1),
  parentProjectId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).optional(),
  brief: z.string().trim().max(20000).optional(),
  type: z.string().trim().max(100).optional(),
  service: serviceTypeSchema,
  priority: prioritySchema,
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
};

export const createProjectSchema = z.object({
  ...projectFields,
  service: serviceTypeSchema.default("OTHER"),
  priority: prioritySchema.default("MEDIUM"),
  memberIds: z.array(z.string().min(1)).default([]),
});

export const updateProjectSchema = z
  .object(projectFields)
  .omit({ clientId: true, parentProjectId: true })
  .partial()
  .extend({ status: projectStatusSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
