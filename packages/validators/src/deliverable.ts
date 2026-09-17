import { z } from "zod";
import { contentTypeSchema, deliverableStatusSchema, prioritySchema } from "./common";

export const createDeliverableSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(10000).optional(),
  contentType: contentTypeSchema.default("OTHER"),
  priority: prioritySchema.default("MEDIUM"),
  assignedToUserId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  agencyNote: z.string().trim().max(10000).optional(),
  clientNote: z.string().trim().max(10000).optional(),
});

export const updateDeliverableSchema = createDeliverableSchema
  .omit({ projectId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const transitionDeliverableSchema = z.object({
  to: deliverableStatusSchema,
});

export type CreateDeliverableInput = z.infer<typeof createDeliverableSchema>;
export type UpdateDeliverableInput = z.infer<typeof updateDeliverableSchema>;
export type TransitionDeliverableInput = z.infer<typeof transitionDeliverableSchema>;
