import { z } from "zod";

const fileMetadataSchema = z.object({
  deliverableId: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(160),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024 * 1024),
  label: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  isMinor: z.boolean().default(false),
  versionBump: z.enum(["MAJOR", "MINOR"]).default("MAJOR"),
  isSource: z.boolean().default(false),
  previewUrl: z.url().optional(),
  purpose: z.enum(["VERSION", "COMPANION_PREVIEW"]).default("VERSION"),
  targetVersionId: z.string().min(1).optional(),
  fileFingerprint: z.string().trim().min(8).max(500).optional(),
});

export const initiateUploadSchema = fileMetadataSchema
  .refine((value) => value.purpose !== "COMPANION_PREVIEW" || Boolean(value.targetVersionId), {
    message: "A companion preview must target an existing version.",
    path: ["targetVersionId"],
  })
  .transform((value) => ({
    ...value,
    versionBump: value.isMinor ? ("MINOR" as const) : value.versionBump,
  }));

export const signUploadPartsSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100),
});

export const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10_000),
        eTag: z.string().min(1),
      }),
    )
    .min(1)
    .max(10_000),
});

export const createExternalVersionSchema = fileMetadataSchema.omit({ fileSizeBytes: true }).extend({
  externalLink: z.url(),
});

export const createExternalCompanionPreviewSchema = z.object({
  targetVersionId: z.string().min(1),
  previewUrl: z.url(),
});

export type InitiateUploadInput = z.infer<typeof initiateUploadSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export type CreateExternalVersionInput = z.infer<typeof createExternalVersionSchema>;
