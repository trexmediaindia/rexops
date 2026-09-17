import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(160).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.url().optional(),
  notes: z.string().trim().max(5000).optional(),
  portalSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

export const updateClientSchema = createClientSchema
  .partial()
  .extend({
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
