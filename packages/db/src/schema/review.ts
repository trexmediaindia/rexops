import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  anchorTypeEnum,
  approvalDecisionEnum,
  commentVisibilityEnum,
  shareAudienceEnum,
  shareWatermarkEnum,
  stageModeEnum,
  stageStatusEnum,
  stageTypeEnum,
} from "./enums";
import { fileVersions } from "./files";
import { idColumn, softDelete, timestamps } from "./helpers";
import { agencies, users } from "./identity";
import { deliverables, tasks } from "./work";

export const pipelines = pgTable(
  "pipeline",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    name: text("name").notNull(),
    projectType: text("project_type"),
    isDefault: boolean("is_default").default(false).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("pipeline_agency_idx").on(table.agencyId)],
);

export const pipelineStages = pgTable(
  "pipeline_stage",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id),
    name: text("name").notNull(),
    type: stageTypeEnum("type").notNull(),
    mode: stageModeEnum("mode").default("SEQUENTIAL").notNull(),
    sequence: integer("sequence").notNull(),
    requiresInternalApproval: boolean("requires_internal_approval").default(false).notNull(),
    requiresClientApproval: boolean("requires_client_approval").default(false).notNull(),
    requiredFieldIds: text("required_field_ids").array().default([]).notNull(),
    wipLimit: integer("wip_limit"),
    isFolded: boolean("is_folded").default(false).notNull(),
    slaHours: integer("sla_hours"),
    escalateToUserId: text("escalate_to_user_id").references(() => users.id),
    requiredCount: integer("required_count").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    index("pipeline_stage_agency_idx").on(table.agencyId),
    uniqueIndex("pipeline_stage_sequence_unique").on(table.pipelineId, table.sequence),
  ],
);

export const pipelineStageApprovers = pgTable(
  "pipeline_stage_approver",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    pipelineStageId: text("pipeline_stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    approverOrder: integer("approver_order").default(1).notNull(),
    required: boolean("required").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pipeline_stage_approver_unique").on(table.pipelineStageId, table.userId),
  ],
);

export const reviewRuns = pgTable(
  "review_run",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    fileVersionId: text("file_version_id")
      .notNull()
      .references(() => fileVersions.id),
    pipelineId: text("pipeline_id").references(() => pipelines.id),
    pipelineName: text("pipeline_name").notNull(),
    status: text("status", {
      enum: ["INTERNAL_REVIEW", "INTERNAL_APPROVED", "CLIENT_REVIEW", "APPROVED", "REJECTED"],
    })
      .default("INTERNAL_REVIEW")
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("review_run_deliverable_idx").on(table.deliverableId, table.createdAt),
    uniqueIndex("review_run_version_unique").on(table.fileVersionId),
  ],
);

export const reviewStages = pgTable(
  "review_stage",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    reviewRunId: text("review_run_id")
      .notNull()
      .references(() => reviewRuns.id),
    pipelineStageId: text("pipeline_stage_id").references(() => pipelineStages.id),
    name: text("name").notNull(),
    type: stageTypeEnum("type").notNull(),
    mode: stageModeEnum("mode").default("SEQUENTIAL").notNull(),
    order: integer("order").notNull(),
    requiredCount: integer("required_count").default(1).notNull(),
    slaHours: integer("sla_hours"),
    escalateToUserId: text("escalate_to_user_id").references(() => users.id),
    status: stageStatusEnum("status").default("PENDING").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("review_stage_agency_idx").on(table.agencyId)],
);

export const reviewStageApprovers = pgTable(
  "review_stage_approver",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    reviewStageId: text("review_stage_id")
      .notNull()
      .references(() => reviewStages.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    approverOrder: integer("approver_order").default(1).notNull(),
    required: boolean("required").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("review_stage_approver_agency_idx").on(table.agencyId),
    uniqueIndex("review_stage_approver_unique").on(table.reviewStageId, table.userId),
  ],
);

export const approvals = pgTable(
  "approval",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    fileVersionId: text("file_version_id")
      .notNull()
      .references(() => fileVersions.id),
    reviewStageId: text("review_stage_id").references(() => reviewStages.id),
    reviewRunId: text("review_run_id")
      .notNull()
      .references(() => reviewRuns.id),
    decidedByUserId: text("decided_by_user_id")
      .notNull()
      .references(() => users.id),
    decision: approvalDecisionEnum("decision").notNull(),
    feedback: text("feedback"),
    eSignature: text("e_signature"),
    signatureConsentText: text("signature_consent_text"),
    signatureConsentVersion: text("signature_consent_version"),
    requestIp: text("request_ip"),
    requestUserAgent: text("request_user_agent"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("approval_agency_idx").on(table.agencyId)],
);

export const comments = pgTable(
  "comment",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    fileVersionId: text("file_version_id").references(() => fileVersions.id),
    parentId: text("parent_id").references((): AnyPgColumn => comments.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    message: text("message").notNull(),
    visibility: commentVisibilityEnum("visibility").default("CLIENT_VISIBLE").notNull(),
    anchorType: anchorTypeEnum("anchor_type").default("NONE").notNull(),
    anchor: jsonb("anchor").$type<Record<string, unknown>>(),
    refVersionIds: text("ref_version_ids").array().default([]).notNull(),
    mentionUserIds: text("mention_user_ids").array().default([]).notNull(),
    hashtags: text("hashtags").array().default([]).notNull(),
    attachments: jsonb("attachments").$type<unknown[]>().default([]).notNull(),
    reactions: jsonb("reactions").$type<Record<string, string[]>>().default({}).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    spawnedTaskId: text("spawned_task_id").references(() => tasks.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("comment_agency_idx").on(table.agencyId),
    index("comment_deliverable_idx").on(table.deliverableId),
  ],
);

export const commentReactions = pgTable(
  "comment_reaction",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("comment_reaction_unique").on(table.commentId, table.userId, table.emoji),
  ],
);

export const shares = pgTable(
  "share",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    resourceType: text("resource_type", {
      enum: ["DELIVERABLE", "FILE_VERSION", "PROJECT", "COLLECTION"],
    }).notNull(),
    resourceId: text("resource_id").notNull(),
    token: text("token").notNull(),
    passphraseHash: text("passphrase_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    allowComment: boolean("allow_comment").default(true).notNull(),
    allowDownload: boolean("allow_download").default(false).notNull(),
    watermark: shareWatermarkEnum("watermark").default("NONE").notNull(),
    audience: shareAudienceEnum("audience").default("CLIENT").notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("share_agency_idx").on(table.agencyId),
    uniqueIndex("share_token_unique").on(table.token),
  ],
);
