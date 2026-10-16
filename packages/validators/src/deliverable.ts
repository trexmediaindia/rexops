import { z } from "zod";
import { contentTypeSchema, deliverableStatusSchema, prioritySchema } from "./common";

/* Fields without defaults; see the note in project.ts on why updates must not inherit
   the create schema's defaults (an edit used to reset contentType and priority). */
const deliverableFields = {
  projectId: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(10000).optional(),
  contentType: contentTypeSchema,
  priority: prioritySchema,
  assignedToUserId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  agencyNote: z.string().trim().max(10000).optional(),
  clientNote: z.string().trim().max(10000).optional(),
  // Social posts and ads: when it goes out, where, and the copy that goes with it.
  publishAt: z.coerce.date().nullable().optional(),
  platforms: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  caption: z.string().trim().max(5000).nullable().optional(),
};

export const createDeliverableSchema = z.object({
  ...deliverableFields,
  contentType: contentTypeSchema.default("OTHER"),
  priority: prioritySchema.default("MEDIUM"),
});

export const updateDeliverableSchema = z
  .object(deliverableFields)
  .omit({ projectId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const transitionDeliverableSchema = z.object({
  to: deliverableStatusSchema,
});

/** Records that an approved post or ad actually went out. */
export const markPublishedSchema = z.object({
  publishUrl: z.url().max(2000).optional(),
});

export type MarkPublishedInput = z.infer<typeof markPublishedSchema>;
export type CreateDeliverableInput = z.infer<typeof createDeliverableSchema>;
export type UpdateDeliverableInput = z.infer<typeof updateDeliverableSchema>;
export type TransitionDeliverableInput = z.infer<typeof transitionDeliverableSchema>;
