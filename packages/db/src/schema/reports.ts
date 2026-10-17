import { index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { attachments } from "./collab";
import { adPlatformEnum } from "./enums";
import { idColumn, softDelete, timestamps } from "./helpers";
import { agencies, clients, users } from "./identity";
import { projects } from "./work";

/**
 * One period's ad results for an ads project, entered by the agency (or, later, synced
 * from Google Ads / Meta). Money is stored as numeric so it never picks up float error.
 */
export const adReports = pgTable(
  "ad_report",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    platform: adPlatformEnum("platform").default("META").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    currency: text("currency").default("INR").notNull(),
    spend: numeric("spend", { precision: 14, scale: 2 }),
    impressions: integer("impressions"),
    reach: integer("reach"),
    clicks: integer("clicks"),
    leads: integer("leads"),
    conversions: integer("conversions"),
    revenue: numeric("revenue", { precision: 14, scale: 2 }),
    summary: text("summary"),
    attachmentId: text("attachment_id").references(() => attachments.id),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("ad_report_agency_project_idx").on(table.agencyId, table.projectId, table.periodStart),
    index("ad_report_client_idx").on(table.clientId),
  ],
);
