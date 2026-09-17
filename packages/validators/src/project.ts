import { z } from "zod";
import { prioritySchema, projectStatusSchema } from "./common";

export const createProjectSchema = z.object({
  clientId: z.string().min(1),
  parentProjectId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).optional(),
  brief: z.string().trim().max(20000).optional(),
  type: z.string().trim().max(100).optional(),
  priority: prioritySchema.default("MEDIUM"),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  memberIds: z.array(z.string().min(1)).default([]),
});

export const updateProjectSchema = createProjectSchema
  .omit({ clientId: true, parentProjectId: true, memberIds: true })
  .partial()
  .extend({ status: projectStatusSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
