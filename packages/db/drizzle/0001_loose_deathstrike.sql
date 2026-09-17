CREATE TYPE "public"."activity_visibility" AS ENUM('INTERNAL', 'CLIENT_VISIBLE');--> statement-breakpoint
CREATE TYPE "public"."attachment_status" AS ENUM('PENDING', 'READY', 'CLAIMED', 'ABORTED');--> statement-breakpoint
CREATE TYPE "public"."preview_status" AS ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."upload_purpose" AS ENUM('VERSION', 'COMPANION_PREVIEW', 'ATTACHMENT');--> statement-breakpoint
CREATE TYPE "public"."version_bump" AS ENUM('MAJOR', 'MINOR');--> statement-breakpoint
ALTER TYPE "public"."upload_status" ADD VALUE 'EXPIRED';--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"object_key" text NOT NULL,
	"upload_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"status" "attachment_status" DEFAULT 'PENDING' NOT NULL,
	"owner_user_id" text NOT NULL,
	"parent_type" text,
	"parent_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_read" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_message_id" text,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stage_approver" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"pipeline_stage_id" text NOT NULL,
	"user_id" text NOT NULL,
	"approver_order" integer DEFAULT 1 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_run" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"deliverable_id" text NOT NULL,
	"file_version_id" text NOT NULL,
	"pipeline_id" text,
	"pipeline_name" text NOT NULL,
	"status" text DEFAULT 'INTERNAL_REVIEW' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_session" ALTER COLUMN "bytes_uploaded" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "activity_event" ADD COLUMN "visibility" "activity_visibility" DEFAULT 'INTERNAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_event" ADD COLUMN "source_event_id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "mention_user_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "hashtags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "source_event_id" text;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "major_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "minor_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "version_bump" "version_bump" DEFAULT 'MAJOR' NOT NULL;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "preview_status" "preview_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "preview_error" text;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "preview_generated_at" timestamp with time zone;--> statement-breakpoint
WITH ordered AS (
  SELECT
    id,
    deliverable_id,
    is_minor,
    row_number() OVER (PARTITION BY deliverable_id ORDER BY created_at, version_number, id) AS rn
  FROM file_version
  WHERE deleted_at IS NULL
), grouped AS (
  SELECT
    *,
    sum(CASE WHEN rn = 1 OR is_minor = false THEN 1 ELSE 0 END)
      OVER (PARTITION BY deliverable_id ORDER BY rn) AS computed_major
  FROM ordered
), numbered AS (
  SELECT
    id,
    computed_major,
    row_number() OVER (PARTITION BY deliverable_id, computed_major ORDER BY rn) - 1 AS computed_minor,
    CASE WHEN rn = 1 OR is_minor = false THEN 'MAJOR'::version_bump ELSE 'MINOR'::version_bump END AS computed_bump
  FROM grouped
)
UPDATE file_version AS target
SET
  major_version = numbered.computed_major,
  minor_version = numbered.computed_minor,
  version_bump = numbered.computed_bump,
  preview_status = CASE WHEN target.preview_url IS NOT NULL THEN 'READY'::preview_status ELSE 'PENDING'::preview_status END,
  preview_generated_at = CASE WHEN target.preview_url IS NOT NULL THEN COALESCE(target.updated_at, target.created_at) ELSE NULL END
FROM numbered
WHERE target.id = numbered.id;--> statement-breakpoint
ALTER TABLE "upload_session" ADD COLUMN "purpose" "upload_purpose" DEFAULT 'VERSION' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_session" ADD COLUMN "target_version_id" text;--> statement-breakpoint
ALTER TABLE "upload_session" ADD COLUMN "file_fingerprint" text;--> statement-breakpoint
ALTER TABLE "upload_session" ADD COLUMN "expires_at" timestamp with time zone DEFAULT (now() + interval '24 hours') NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_session" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approval" ADD COLUMN "review_run_id" text;--> statement-breakpoint
ALTER TABLE "approval" ADD COLUMN "signature_consent_text" text;--> statement-breakpoint
ALTER TABLE "approval" ADD COLUMN "signature_consent_version" text;--> statement-breakpoint
ALTER TABLE "approval" ADD COLUMN "request_ip" text;--> statement-breakpoint
ALTER TABLE "approval" ADD COLUMN "request_user_agent" text;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "mention_user_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "hashtags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "review_stage_approver" ADD COLUMN "approver_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_stage_approver" ADD COLUMN "required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "review_stage" ADD COLUMN "review_run_id" text;--> statement-breakpoint
ALTER TABLE "review_stage" ADD COLUMN "pipeline_stage_id" text;--> statement-breakpoint
ALTER TABLE "review_stage" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_stage" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_stage" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO review_run (
  id,
  agency_id,
  deliverable_id,
  file_version_id,
  pipeline_name,
  status,
  started_at,
  completed_at,
  created_by_user_id,
  created_at
)
SELECT
  gen_random_uuid()::text,
  fv.agency_id,
  fv.deliverable_id,
  fv.id,
  'Legacy review history',
  CASE
    WHEN fv.status = 'APPROVED' THEN 'APPROVED'
    WHEN fv.status = 'INTERNAL_APPROVED' THEN 'INTERNAL_APPROVED'
    WHEN fv.status = 'UNDER_CLIENT_REVIEW' THEN 'CLIENT_REVIEW'
    WHEN fv.status = 'CHANGES_REQUESTED' THEN 'REJECTED'
    ELSE 'INTERNAL_REVIEW'
  END,
  fv.created_at,
  CASE WHEN fv.status IN ('APPROVED', 'CHANGES_REQUESTED', 'REPLACED') THEN fv.updated_at ELSE NULL END,
  fv.uploaded_by_user_id,
  fv.created_at
FROM file_version fv
WHERE EXISTS (
  SELECT 1 FROM approval a WHERE a.file_version_id = fv.id
)
OR fv.id IN (
  SELECT DISTINCT ON (deliverable_id) id
  FROM file_version
  WHERE deleted_at IS NULL
  ORDER BY deliverable_id, version_number DESC
);--> statement-breakpoint
UPDATE approval a
SET review_run_id = rr.id
FROM review_run rr
WHERE rr.file_version_id = a.file_version_id;--> statement-breakpoint
UPDATE review_stage rs
SET review_run_id = latest_run.id
FROM (
  SELECT DISTINCT ON (deliverable_id) id, deliverable_id
  FROM review_run
  ORDER BY deliverable_id, created_at DESC
) latest_run
WHERE latest_run.deliverable_id = rs.deliverable_id;--> statement-breakpoint
DELETE FROM review_stage_approver
WHERE review_stage_id IN (SELECT id FROM review_stage WHERE review_run_id IS NULL);--> statement-breakpoint
DELETE FROM review_stage WHERE review_run_id IS NULL;--> statement-breakpoint
DELETE FROM approval WHERE review_run_id IS NULL;--> statement-breakpoint
ALTER TABLE "approval" ALTER COLUMN "review_run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review_stage" ALTER COLUMN "review_run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read" ADD CONSTRAINT "channel_read_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read" ADD CONSTRAINT "channel_read_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read" ADD CONSTRAINT "channel_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read" ADD CONSTRAINT "channel_read_last_read_message_id_message_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage_approver" ADD CONSTRAINT "pipeline_stage_approver_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage_approver" ADD CONSTRAINT "pipeline_stage_approver_pipeline_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("pipeline_stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage_approver" ADD CONSTRAINT "pipeline_stage_approver_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_deliverable_id_deliverable_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_file_version_id_file_version_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_agency_owner_idx" ON "attachment" USING btree ("agency_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "attachment_parent_idx" ON "attachment" USING btree ("parent_type","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_read_unique" ON "channel_read" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_reaction_unique" ON "comment_reaction" USING btree ("comment_id","user_id","emoji");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stage_approver_unique" ON "pipeline_stage_approver" USING btree ("pipeline_stage_id","user_id");--> statement-breakpoint
CREATE INDEX "review_run_deliverable_idx" ON "review_run" USING btree ("deliverable_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_run_version_unique" ON "review_run" USING btree ("file_version_id");--> statement-breakpoint
ALTER TABLE "upload_session" ADD CONSTRAINT "upload_session_target_version_id_file_version_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."file_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_stage" ADD CONSTRAINT "review_stage_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_stage" ADD CONSTRAINT "review_stage_pipeline_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("pipeline_stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_source_event_unique" ON "activity_event" USING btree ("source_event_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_scope_unique" ON "channel" USING btree ("agency_id","scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_source_recipient_unique" ON "notification" USING btree ("source_event_id","recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_version_semver_unique" ON "file_version" USING btree ("deliverable_id","major_version","minor_version");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_approval_mutation()
RETURNS trigger AS $$
BEGIN
  IF current_setting('rexops.allow_approval_mutation', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'approval rows are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER approval_immutable_update
BEFORE UPDATE ON approval
FOR EACH ROW EXECUTE FUNCTION prevent_approval_mutation();--> statement-breakpoint
CREATE TRIGGER approval_immutable_delete
BEFORE DELETE ON approval
FOR EACH ROW EXECUTE FUNCTION prevent_approval_mutation();
