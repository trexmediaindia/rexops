import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  activityTypeEnum,
  activityVisibilityEnum,
  attachmentStatusEnum,
  contentTypeEnum,
  notificationTypeEnum,
  userRoleEnum,
} from "./enums";
import { idColumn, softDelete, timestamps } from "./helpers";
import { agencies, users } from "./identity";
import { deliverables, projects } from "./work";

export const activityEvents = pgTable(
  "activity_event",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    subjectType: text("subject_type", {
      enum: ["DELIVERABLE", "FILE_VERSION", "PROJECT"],
    }).notNull(),
    subjectId: text("subject_id").notNull(),
    type: activityTypeEnum("type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id),
    summary: text("summary").notNull(),
    visibility: activityVisibilityEnum("visibility").default("INTERNAL").notNull(),
    sourceEventId: text("source_event_id").default(sql`gen_random_uuid()::text`).notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activity_agency_subject_idx").on(table.agencyId, table.subjectId),
    uniqueIndex("activity_source_event_unique").on(
      table.sourceEventId,
      table.subjectType,
      table.subjectId,
    ),
  ],
);

export const channels = pgTable(
  "channel",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    scopeType: text("scope_type", { enum: ["PROJECT", "DELIVERABLE", "DM"] }).notNull(),
    scopeId: text("scope_id"),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channel_agency_idx").on(table.agencyId),
    uniqueIndex("channel_scope_unique").on(table.agencyId, table.scopeType, table.scopeId),
  ],
);

export const messages = pgTable(
  "message",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    refVersionIds: text("ref_version_ids").array().default([]).notNull(),
    mentionUserIds: text("mention_user_ids").array().default([]).notNull(),
    hashtags: text("hashtags").array().default([]).notNull(),
    attachments: jsonb("attachments").$type<unknown[]>().default([]).notNull(),
    parentId: text("parent_id").references((): AnyPgColumn => messages.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("message_agency_channel_idx").on(table.agencyId, table.channelId)],
);

export const channelReads = pgTable(
  "channel_read",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    lastReadMessageId: text("last_read_message_id").references(() => messages.id),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("channel_read_unique").on(table.channelId, table.userId)],
);

export const attachments = pgTable(
  "attachment",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    objectKey: text("object_key").notNull(),
    uploadId: text("upload_id").notNull(),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "bigint" }).notNull(),
    status: attachmentStatusEnum("status").default("PENDING").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    parentType: text("parent_type", { enum: ["COMMENT", "MESSAGE"] }),
    parentId: text("parent_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (table) => [
    index("attachment_agency_owner_idx").on(table.agencyId, table.ownerUserId),
    index("attachment_parent_idx").on(table.parentType, table.parentId),
  ],
);

export const notifications = pgTable(
  "notification",
  {
    id: idColumn(),
    agencyId: text("agency_id").references(() => agencies.id),
    recipientUserId: text("recipient_user_id").references(() => users.id),
    recipientRole: userRoleEnum("recipient_role"),
    sourceEventId: text("source_event_id"),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    message: text("message"),
    url: text("url"),
    contentType: contentTypeEnum("content_type"),
    relatedProjectId: text("related_project_id").references(() => projects.id),
    relatedDeliverableId: text("related_deliverable_id").references(() => deliverables.id),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notification_agency_idx").on(table.agencyId),
    index("notification_recipient_idx").on(table.recipientUserId, table.isRead),
    uniqueIndex("notification_source_recipient_unique").on(
      table.sourceEventId,
      table.recipientUserId,
    ),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscription",
  {
    id: idColumn(),
    agencyId: text("agency_id").references(() => agencies.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    index("push_agency_idx").on(table.agencyId),
    uniqueIndex("push_endpoint_unique").on(table.endpoint),
  ],
);
