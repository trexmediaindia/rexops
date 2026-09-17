import { z } from "zod";

export const createChannelSchema = z.object({
  scopeType: z.enum(["PROJECT", "DELIVERABLE", "DM"]),
  scopeId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  parentId: z.string().min(1).optional(),
  refVersionIds: z.array(z.string().min(1)).max(20).default([]),
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
  mentionUserIds: z.array(z.string().min(1)).max(50).default([]),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
