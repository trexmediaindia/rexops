import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  fileVersionStatusEnum,
  fileVersionVisibilityEnum,
  previewStatusEnum,
  uploadPurposeEnum,
  uploadStatusEnum,
  versionBumpEnum,
} from "./enums";
import { idColumn, softDelete, timestamps } from "./helpers";
import { agencies, users } from "./identity";
import { deliverables } from "./work";

export const fileVersions = pgTable(
  "file_version",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    versionNumber: integer("version_number").notNull(),
    majorVersion: integer("major_version").default(1).notNull(),
    minorVersion: integer("minor_version").default(0).notNull(),
    versionBump: versionBumpEnum("version_bump").default("MAJOR").notNull(),
    label: text("label"),
    tags: text("tags").array().default([]).notNull(),
    isMinor: boolean("is_minor").default(false).notNull(),
    fileUrl: text("file_url"),
    externalLink: text("external_link"),
    previewUrl: text("preview_url"),
    posterFrameUrl: text("poster_frame_url"),
    thumbnailSpriteUrl: text("thumbnail_sprite_url"),
    spriteIntervalMs: integer("sprite_interval_ms"),
    spriteColumns: integer("sprite_columns"),
    spriteRows: integer("sprite_rows"),
    spriteCellWidth: integer("sprite_cell_width"),
    spriteCellHeight: integer("sprite_cell_height"),
    durationMs: integer("duration_ms"),
    previewStatus: previewStatusEnum("preview_status").default("PENDING").notNull(),
    previewError: text("preview_error"),
    previewGeneratedAt: timestamp("preview_generated_at", { withTimezone: true }),
    fileName: text("file_name"),
    fileType: text("file_type"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "bigint" }),
    isSource: boolean("is_source").default(false).notNull(),
    visibility: fileVersionVisibilityEnum("visibility").default("INTERNAL").notNull(),
    status: fileVersionStatusEnum("status").default("UPLOADED").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("file_version_agency_idx").on(table.agencyId),
    index("file_version_deliverable_idx").on(table.deliverableId),
    uniqueIndex("file_version_unique").on(table.deliverableId, table.versionNumber),
    uniqueIndex("file_version_semver_unique").on(
      table.deliverableId,
      table.majorVersion,
      table.minorVersion,
    ),
  ],
);

export const uploadSessions = pgTable(
  "upload_session",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    purpose: uploadPurposeEnum("purpose").default("VERSION").notNull(),
    targetVersionId: text("target_version_id").references(() => fileVersions.id),
    fileFingerprint: text("file_fingerprint"),
    uploadKey: text("upload_key").notNull(),
    bytesTotal: bigint("bytes_total", { mode: "bigint" }),
    bytesUploaded: bigint("bytes_uploaded", { mode: "bigint" }).default(sql`0`).notNull(),
    status: uploadStatusEnum("status").default("INIT").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [index("upload_session_agency_idx").on(table.agencyId)],
);
