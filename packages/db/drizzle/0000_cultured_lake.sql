CREATE TYPE "public"."activity_type" AS ENUM('COMMENT', 'STATUS_CHANGE', 'APPROVAL', 'UPLOAD', 'ASSIGNMENT', 'STAGE_CHANGE', 'SHARE');--> statement-breakpoint
CREATE TYPE "public"."anchor_type" AS ENUM('NONE', 'TIMECODE', 'REGION', 'WAVEFORM_RANGE', 'VIEWPOINT_3D', 'WEB_SELECTOR');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('APPROVE', 'REQUEST_CHANGES', 'REJECT');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."comment_visibility" AS ENUM('INTERNAL', 'CLIENT_VISIBLE');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('MOTION', 'STATIC', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('TEXT', 'NUMBER', 'SINGLE_SELECT', 'MULTI_SELECT', 'DATE', 'BOOLEAN', 'RATING');--> statement-breakpoint
CREATE TYPE "public"."deliverable_status" AS ENUM('PENDING', 'IN_PROGRESS', 'READY_FOR_INTERNAL_REVIEW', 'UNDER_INTERNAL_REVIEW', 'INTERNAL_APPROVED', 'UNDER_CLIENT_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'DELIVERED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."dependency_type" AS ENUM('FS', 'SS', 'FF', 'SF');--> statement-breakpoint
CREATE TYPE "public"."fv_status" AS ENUM('UPLOADED', 'UNDER_INTERNAL_REVIEW', 'INTERNAL_APPROVED', 'UNDER_CLIENT_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REPLACED');--> statement-breakpoint
CREATE TYPE "public"."fv_visibility" AS ENUM('INTERNAL', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('PROJECT_CREATED', 'DELIVERABLE_CREATED', 'VERSION_UPLOADED', 'INTERNAL_REVIEW_REQUESTED', 'SUBMITTED_TO_CLIENT', 'REVISION_REQUESTED', 'APPROVED', 'DELIVERED', 'COMMENT_ADDED', 'MENTION', 'DUE_DATE_REMINDER', 'STAGE_STALLED', 'SHARE_VIEWED', 'ASSIGNMENT');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('DRAFT', 'ACTIVE', 'IN_PROGRESS', 'WAITING_FOR_CLIENT', 'COMPLETED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."recurrence_mode" AS ENUM('TIME_DRIVEN', 'COMPLETION_DRIVEN');--> statement-breakpoint
CREATE TYPE "public"."rule_kind" AS ENUM('RULE', 'CARD_BUTTON', 'BOARD_BUTTON', 'SCHEDULED', 'DUE_DATE');--> statement-breakpoint
CREATE TYPE "public"."share_audience" AS ENUM('INTERNAL', 'CLIENT', 'GUEST');--> statement-breakpoint
CREATE TYPE "public"."share_watermark" AS ENUM('NONE', 'STANDARD', 'FORENSIC');--> statement-breakpoint
CREATE TYPE "public"."specialty" AS ENUM('EDITOR', 'MOTION', 'DESIGNER', 'PHOTOGRAPHER', 'PM', 'ACCOUNT', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."stage_mode" AS ENUM('SEQUENTIAL', 'PARALLEL');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('PENDING', 'ACTIVE', 'PASSED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."stage_type" AS ENUM('INTERNAL', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('QUEUED', 'PROVISIONED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('INIT', 'UPLOADING', 'COMPLETE', 'ABORTED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'AGENCY_OWNER', 'AGENCY_ADMIN', 'AGENCY_MEMBER', 'CLIENT_OWNER', 'CLIENT_MEMBER');--> statement-breakpoint
CREATE TYPE "public"."view_type" AS ENUM('BOARD', 'LIST', 'CALENDAR', 'TIMELINE');--> statement-breakpoint
CREATE TABLE "form_field" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"form_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "custom_field_type" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"branching_json" jsonb,
	"map_to_field" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"form_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"status" "submission_status" DEFAULT 'QUEUED' NOT NULL,
	"created_project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_form" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"target_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"scope" text NOT NULL,
	"template_pack_id" text,
	"source_project_id" text,
	"cadence" text NOT NULL,
	"mode" "recurrence_mode" DEFAULT 'TIME_DRIVEN' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "rule_kind" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text,
	"trigger" jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_pack" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_event" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"type" "activity_type" NOT NULL,
	"actor_user_id" text,
	"summary" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"ref_version_ids" text[] DEFAULT '{}' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text,
	"recipient_user_id" text,
	"recipient_role" "user_role",
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"url" text,
	"content_type" "content_type",
	"related_project_id" text,
	"related_deliverable_id" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_field_def" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "custom_field_type" NOT NULL,
	"options" jsonb,
	"groupable" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT true NOT NULL,
	"sortable" boolean DEFAULT true NOT NULL,
	"visibility" text DEFAULT 'INTERNAL' NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_value" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"field_def_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_view" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"owner_user_id" text,
	"scope" text NOT NULL,
	"scope_id" text,
	"name" text NOT NULL,
	"view_type" "view_type" NOT NULL,
	"filter_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"group_by" text,
	"visible_field_ids" text[] DEFAULT '{}' NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_version" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"deliverable_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"label" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"file_url" text,
	"external_link" text,
	"preview_url" text,
	"file_name" text,
	"file_type" text,
	"file_size_bytes" bigint,
	"is_source" boolean DEFAULT false NOT NULL,
	"visibility" "fv_visibility" DEFAULT 'INTERNAL' NOT NULL,
	"status" "fv_status" DEFAULT 'UPLOADED' NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "upload_session" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"deliverable_id" text NOT NULL,
	"upload_key" text NOT NULL,
	"bytes_total" bigint,
	"bytes_uploaded" bigint DEFAULT 0 NOT NULL,
	"status" "upload_status" DEFAULT 'INIT' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"brand_color" text,
	"better_auth_org_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"agency_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"notes" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"portal_slug" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'AGENCY_MEMBER' NOT NULL,
	"specialty" "specialty",
	"agency_id" text,
	"client_id" text,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"deliverable_id" text NOT NULL,
	"file_version_id" text NOT NULL,
	"review_stage_id" text,
	"decided_by_user_id" text NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"feedback" text,
	"e_signature" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"deliverable_id" text NOT NULL,
	"file_version_id" text,
	"parent_id" text,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"visibility" "comment_visibility" DEFAULT 'CLIENT_VISIBLE' NOT NULL,
	"anchor_type" "anchor_type" DEFAULT 'NONE' NOT NULL,
	"anchor" jsonb,
	"ref_version_ids" text[] DEFAULT '{}' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reactions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"spawned_task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "stage_type" NOT NULL,
	"mode" "stage_mode" DEFAULT 'SEQUENTIAL' NOT NULL,
	"sequence" integer NOT NULL,
	"requires_internal_approval" boolean DEFAULT false NOT NULL,
	"requires_client_approval" boolean DEFAULT false NOT NULL,
	"required_field_ids" text[] DEFAULT '{}' NOT NULL,
	"wip_limit" integer,
	"is_folded" boolean DEFAULT false NOT NULL,
	"sla_hours" integer,
	"required_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"project_type" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_stage_approver" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"review_stage_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"deliverable_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "stage_type" NOT NULL,
	"mode" "stage_mode" DEFAULT 'SEQUENTIAL' NOT NULL,
	"order" integer NOT NULL,
	"required_count" integer DEFAULT 1 NOT NULL,
	"sla_hours" integer,
	"escalate_to_user_id" text,
	"status" "stage_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"token" text NOT NULL,
	"passphrase_hash" text,
	"expires_at" timestamp with time zone,
	"allow_comment" boolean DEFAULT true NOT NULL,
	"allow_download" boolean DEFAULT false NOT NULL,
	"watermark" "share_watermark" DEFAULT 'NONE' NOT NULL,
	"audience" "share_audience" DEFAULT 'CLIENT' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checklist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"checklist_id" text NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"assigned_to_user_id" text,
	"due_date" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"deliverable_id" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable_placement" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"deliverable_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"client_id" text NOT NULL,
	"project_id" text NOT NULL,
	"content_type" "content_type" DEFAULT 'OTHER' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "deliverable_status" DEFAULT 'PENDING' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"assigned_to_user_id" text,
	"due_date" timestamp with time zone,
	"agency_note" text,
	"client_note" text,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dependency" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"from_deliverable_id" text NOT NULL,
	"to_deliverable_id" text NOT NULL,
	"type" "dependency_type" DEFAULT 'FS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"due_date" timestamp with time zone,
	"reached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_on_project" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"client_id" text NOT NULL,
	"parent_project_id" text,
	"name" text NOT NULL,
	"description" text,
	"brief" text,
	"type" text,
	"status" "project_status" DEFAULT 'ACTIVE' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"start_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"project_id" text,
	"deliverable_id" text,
	"parent_task_id" text,
	"title" text NOT NULL,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"assigned_to_user_id" text,
	"due_date" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"task_type" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "form_field" ADD CONSTRAINT "form_field_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field" ADD CONSTRAINT "form_field_form_id_intake_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."intake_form"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_form_id_intake_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."intake_form"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_created_project_id_project_id_fk" FOREIGN KEY ("created_project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form" ADD CONSTRAINT "intake_form_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_template_pack_id_template_pack_id_fk" FOREIGN KEY ("template_pack_id") REFERENCES "public"."template_pack"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_source_project_id_project_id_fk" FOREIGN KEY ("source_project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule" ADD CONSTRAINT "rule_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_pack" ADD CONSTRAINT "template_pack_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_parent_id_message_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_related_project_id_project_id_fk" FOREIGN KEY ("related_project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_related_deliverable_id_deliverable_id_fk" FOREIGN KEY ("related_deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_def" ADD CONSTRAINT "custom_field_def_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value" ADD CONSTRAINT "custom_field_value_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value" ADD CONSTRAINT "custom_field_value_field_def_id_custom_field_def_id_fk" FOREIGN KEY ("field_def_id") REFERENCES "public"."custom_field_def"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session" ADD CONSTRAINT "upload_session_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session" ADD CONSTRAINT "upload_session_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session" ADD CONSTRAINT "upload_session_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_file_version_id_file_version_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_review_stage_id_review_stage_id_fk" FOREIGN KEY ("review_stage_id") REFERENCES "public"."review_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_file_version_id_file_version_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_spawned_task_id_task_id_fk" FOREIGN KEY ("spawned_task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_stage_approver" ADD CONSTRAINT "review_stage_approver_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_stage_approver" ADD CONSTRAINT "review_stage_approver_review_stage_id_review_stage_id_fk" FOREIGN KEY ("review_stage_id") REFERENCES "public"."review_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_stage_approver" ADD CONSTRAINT "review_stage_approver_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_stage" ADD CONSTRAINT "review_stage_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_stage" ADD CONSTRAINT "review_stage_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_stage" ADD CONSTRAINT "review_stage_escalate_to_user_id_user_id_fk" FOREIGN KEY ("escalate_to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_checklist_id_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklist"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist" ADD CONSTRAINT "checklist_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist" ADD CONSTRAINT "checklist_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_placement" ADD CONSTRAINT "deliverable_placement_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_placement" ADD CONSTRAINT "deliverable_placement_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_placement" ADD CONSTRAINT "deliverable_placement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency" ADD CONSTRAINT "dependency_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency" ADD CONSTRAINT "dependency_from_deliverable_id_deliverable_id_fk" FOREIGN KEY ("from_deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency" ADD CONSTRAINT "dependency_to_deliverable_id_deliverable_id_fk" FOREIGN KEY ("to_deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_parent_project_id_project_id_fk" FOREIGN KEY ("parent_project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_parent_task_id_task_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_field_agency_idx" ON "form_field" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "submission_agency_idx" ON "form_submission" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "intake_form_agency_idx" ON "intake_form" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "recurring_agency_idx" ON "recurring_schedule" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "rule_agency_idx" ON "rule" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "template_pack_agency_idx" ON "template_pack" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "activity_agency_subject_idx" ON "activity_event" USING btree ("agency_id","subject_id");--> statement-breakpoint
CREATE INDEX "channel_agency_idx" ON "channel" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "message_agency_channel_idx" ON "message" USING btree ("agency_id","channel_id");--> statement-breakpoint
CREATE INDEX "notification_agency_idx" ON "notification" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notification" USING btree ("recipient_user_id","is_read");--> statement-breakpoint
CREATE INDEX "push_agency_idx" ON "push_subscription" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_unique" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "field_def_agency_idx" ON "custom_field_def" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_def_key_unique" ON "custom_field_def" USING btree ("agency_id","scope","key");--> statement-breakpoint
CREATE INDEX "field_value_agency_idx" ON "custom_field_value" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_value_unique" ON "custom_field_value" USING btree ("field_def_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "saved_view_agency_idx" ON "saved_view" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "file_version_agency_idx" ON "file_version" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "file_version_deliverable_idx" ON "file_version" USING btree ("deliverable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_version_unique" ON "file_version" USING btree ("deliverable_id","version_number");--> statement-breakpoint
CREATE INDEX "upload_session_agency_idx" ON "upload_session" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_slug_unique" ON "agency" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_auth_org_unique" ON "agency" USING btree ("better_auth_org_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_agency_idx" ON "audit_log" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "client_agency_idx" ON "client" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "client_agency_status_idx" ON "client" USING btree ("agency_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "client_portal_slug_unique" ON "client" USING btree ("portal_slug");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_org_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_unique" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_agency_idx" ON "user" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "user_client_idx" ON "user" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "approval_agency_idx" ON "approval" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "comment_agency_idx" ON "comment" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "comment_deliverable_idx" ON "comment" USING btree ("deliverable_id");--> statement-breakpoint
CREATE INDEX "pipeline_stage_agency_idx" ON "pipeline_stage" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stage_sequence_unique" ON "pipeline_stage" USING btree ("pipeline_id","sequence");--> statement-breakpoint
CREATE INDEX "pipeline_agency_idx" ON "pipeline" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "review_stage_approver_agency_idx" ON "review_stage_approver" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_stage_approver_unique" ON "review_stage_approver" USING btree ("review_stage_id","user_id");--> statement-breakpoint
CREATE INDEX "review_stage_agency_idx" ON "review_stage" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "share_agency_idx" ON "share" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_token_unique" ON "share" USING btree ("token");--> statement-breakpoint
CREATE INDEX "checklist_item_agency_idx" ON "checklist_item" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "checklist_agency_idx" ON "checklist" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "placement_agency_idx" ON "deliverable_placement" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_unique" ON "deliverable_placement" USING btree ("deliverable_id","project_id");--> statement-breakpoint
CREATE INDEX "deliverable_agency_idx" ON "deliverable" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "deliverable_agency_project_status_idx" ON "deliverable" USING btree ("agency_id","project_id","status");--> statement-breakpoint
CREATE INDEX "deliverable_assignee_idx" ON "deliverable" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "dependency_agency_idx" ON "dependency" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_unique" ON "dependency" USING btree ("from_deliverable_id","to_deliverable_id","type");--> statement-breakpoint
CREATE INDEX "milestone_agency_idx" ON "milestone" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "project_member_agency_idx" ON "project_member" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_member_unique" ON "project_member" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_agency_idx" ON "project" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "project_agency_client_status_idx" ON "project" USING btree ("agency_id","client_id","status");--> statement-breakpoint
CREATE INDEX "project_parent_idx" ON "project" USING btree ("parent_project_id");--> statement-breakpoint
CREATE INDEX "task_agency_idx" ON "task" USING btree ("agency_id");