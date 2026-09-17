import { z } from "zod";

export const createCommentSchema = z.object({
  fileVersionId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(5000),
  visibility: z.enum(["INTERNAL", "CLIENT_VISIBLE"]).default("CLIENT_VISIBLE"),
  anchorType: z.enum(["NONE", "TIMECODE", "REGION", "WAVEFORM_RANGE"]).default("NONE"),
  anchor: z.record(z.string(), z.unknown()).optional(),
  refVersionIds: z.array(z.string().min(1)).max(20).default([]),
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
  mentionUserIds: z.array(z.string().min(1)).max(50).default([]),
});

export const reviewDecisionSchema = z.object({
  fileVersionId: z.string().min(1),
  decision: z.enum(["APPROVE", "REQUEST_CHANGES", "REJECT"]),
  feedback: z.string().trim().max(5000).optional(),
  eSignature: z.string().trim().min(2).max(160).optional(),
  signatureConsentText: z.string().trim().min(10).max(1000).optional(),
  signatureConsentVersion: z.string().trim().min(1).max(50).optional(),
});

export const createShareSchema = z
  .object({
    resourceType: z.enum(["DELIVERABLE", "FILE_VERSION"]),
    resourceId: z.string().min(1),
    passphrase: z.string().min(6).max(128).optional(),
    expiresAt: z.coerce.date().optional(),
    allowComment: z.boolean().default(true),
    allowDownload: z.boolean().default(false),
    watermark: z.enum(["NONE", "STANDARD"]).default("NONE"),
    audience: z.enum(["INTERNAL", "CLIENT", "GUEST"]).default("GUEST"),
  })
  .refine((value) => !value.expiresAt || value.expiresAt > new Date(), {
    message: "Share expiry must be in the future.",
    path: ["expiresAt"],
  });

export const accessShareSchema = z.object({
  passphrase: z.string().max(128).optional(),
});

export const guestCommentSchema = z.object({
  passphrase: z.string().max(128).optional(),
  guestName: z.string().trim().min(2).max(100),
  message: z.string().trim().min(1).max(5000),
  fileVersionId: z.string().min(1).optional(),
  anchorType: z.enum(["NONE", "TIMECODE", "REGION", "WAVEFORM_RANGE"]).default("NONE"),
  anchor: z.record(z.string(), z.unknown()).optional(),
  parentId: z.string().min(1).optional(),
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
export type CreateShareInput = z.infer<typeof createShareSchema>;
export type GuestCommentInput = z.infer<typeof guestCommentSchema>;
