import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "AGENCY_OWNER",
  "AGENCY_ADMIN",
  "AGENCY_MEMBER",
  "CLIENT_OWNER",
  "CLIENT_MEMBER",
]);
export const specialtyEnum = pgEnum("specialty", [
  "EDITOR",
  "MOTION",
  "DESIGNER",
  "PHOTOGRAPHER",
  "PM",
  "ACCOUNT",
  "GENERAL",
]);
export const contentTypeEnum = pgEnum("content_type", ["MOTION", "STATIC", "OTHER"]);
export const clientStatusEnum = pgEnum("client_status", ["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const projectStatusEnum = pgEnum("project_status", [
  "DRAFT",
  "ACTIVE",
  "IN_PROGRESS",
  "WAITING_FOR_CLIENT",
  "COMPLETED",
  "ARCHIVED",
]);
export const priorityEnum = pgEnum("priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const deliverableStatusEnum = pgEnum("deliverable_status", [
  "PENDING",
  "IN_PROGRESS",
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "INTERNAL_APPROVED",
  "UNDER_CLIENT_REVIEW",
  "REVISION_REQUESTED",
  "APPROVED",
  "DELIVERED",
  "ARCHIVED",
]);
export const fileVersionStatusEnum = pgEnum("fv_status", [
  "UPLOADED",
  "UNDER_INTERNAL_REVIEW",
  "INTERNAL_APPROVED",
  "UNDER_CLIENT_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REPLACED",
]);
export const fileVersionVisibilityEnum = pgEnum("fv_visibility", ["INTERNAL", "CLIENT"]);
export const stageModeEnum = pgEnum("stage_mode", ["SEQUENTIAL", "PARALLEL"]);
export const stageTypeEnum = pgEnum("stage_type", ["INTERNAL", "CLIENT"]);
export const stageStatusEnum = pgEnum("stage_status", ["PENDING", "ACTIVE", "PASSED", "REJECTED"]);
export const approvalDecisionEnum = pgEnum("approval_decision", [
  "APPROVE",
  "REQUEST_CHANGES",
  "REJECT",
]);
export const commentVisibilityEnum = pgEnum("comment_visibility", ["INTERNAL", "CLIENT_VISIBLE"]);
export const anchorTypeEnum = pgEnum("anchor_type", [
  "NONE",
  "TIMECODE",
  "REGION",
  "WAVEFORM_RANGE",
  "VIEWPOINT_3D",
  "WEB_SELECTOR",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "PROJECT_CREATED",
  "DELIVERABLE_CREATED",
  "VERSION_UPLOADED",
  "INTERNAL_REVIEW_REQUESTED",
  "SUBMITTED_TO_CLIENT",
  "REVISION_REQUESTED",
  "APPROVED",
  "DELIVERED",
  "COMMENT_ADDED",
  "MENTION",
  "DUE_DATE_REMINDER",
  "STAGE_STALLED",
  "SHARE_VIEWED",
  "ASSIGNMENT",
]);
export const activityTypeEnum = pgEnum("activity_type", [
  "COMMENT",
  "STATUS_CHANGE",
  "APPROVAL",
  "UPLOAD",
  "ASSIGNMENT",
  "STAGE_CHANGE",
  "SHARE",
]);
export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "TEXT",
  "NUMBER",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "DATE",
  "BOOLEAN",
  "RATING",
]);
export const viewTypeEnum = pgEnum("view_type", ["BOARD", "LIST", "CALENDAR", "TIMELINE"]);
export const ruleKindEnum = pgEnum("rule_kind", [
  "RULE",
  "CARD_BUTTON",
  "BOARD_BUTTON",
  "SCHEDULED",
  "DUE_DATE",
]);
export const dependencyTypeEnum = pgEnum("dependency_type", ["FS", "SS", "FF", "SF"]);
export const shareAudienceEnum = pgEnum("share_audience", ["INTERNAL", "CLIENT", "GUEST"]);
export const shareWatermarkEnum = pgEnum("share_watermark", ["NONE", "STANDARD", "FORENSIC"]);
export const taskStatusEnum = pgEnum("task_status", ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]);
export const recurrenceModeEnum = pgEnum("recurrence_mode", ["TIME_DRIVEN", "COMPLETION_DRIVEN"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["PENDING", "SENT", "FAILED"]);
export const uploadStatusEnum = pgEnum("upload_status", [
  "INIT",
  "UPLOADING",
  "COMPLETE",
  "ABORTED",
  "EXPIRED",
]);
export const uploadPurposeEnum = pgEnum("upload_purpose", [
  "VERSION",
  "COMPANION_PREVIEW",
  "ATTACHMENT",
]);
export const versionBumpEnum = pgEnum("version_bump", ["MAJOR", "MINOR"]);
export const previewStatusEnum = pgEnum("preview_status", [
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
]);
export const activityVisibilityEnum = pgEnum("activity_visibility", ["INTERNAL", "CLIENT_VISIBLE"]);
export const attachmentStatusEnum = pgEnum("attachment_status", [
  "PENDING",
  "READY",
  "CLAIMED",
  "ABORTED",
]);
export const submissionStatusEnum = pgEnum("submission_status", [
  "QUEUED",
  "PROVISIONED",
  "REJECTED",
]);
