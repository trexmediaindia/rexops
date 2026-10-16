import { z } from "zod";

const count = z.coerce.number().int().min(0).max(2_000_000_000).optional();
const money = z.coerce.number().min(0).max(1_000_000_000_000).optional();

/** One period of ad results, typed in by the agency from Ads Manager / Google Ads. */
export const createAdReportSchema = z
  .object({
    platform: z.enum(["META", "GOOGLE", "OTHER"]).default("META"),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase())
      .default("INR"),
    spend: money,
    impressions: count,
    reach: count,
    clicks: count,
    leads: count,
    conversions: count,
    revenue: money,
    summary: z.string().trim().max(5000).optional(),
    attachmentId: z.string().min(1).optional(),
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: "The period has to end on or after the day it starts.",
    path: ["periodEnd"],
  });

export type CreateAdReportInput = z.infer<typeof createAdReportSchema>;
