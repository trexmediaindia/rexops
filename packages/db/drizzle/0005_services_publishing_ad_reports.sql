CREATE TYPE "public"."ad_platform" AS ENUM('META', 'GOOGLE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('SOCIAL_MEDIA', 'CREATIVES', 'ADS', 'OTHER');--> statement-breakpoint
CREATE TABLE "ad_report" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"client_id" text NOT NULL,
	"project_id" text NOT NULL,
	"platform" "ad_platform" DEFAULT 'META' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"spend" numeric(14, 2),
	"impressions" integer,
	"reach" integer,
	"clicks" integer,
	"leads" integer,
	"conversions" integer,
	"revenue" numeric(14, 2),
	"summary" text,
	"attachment_id" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deliverable" ADD COLUMN "publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliverable" ADD COLUMN "platforms" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "deliverable" ADD COLUMN "caption" text;--> statement-breakpoint
ALTER TABLE "deliverable" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliverable" ADD COLUMN "publish_url" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "service" "service_type" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_report" ADD CONSTRAINT "ad_report_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_report" ADD CONSTRAINT "ad_report_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_report" ADD CONSTRAINT "ad_report_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_report" ADD CONSTRAINT "ad_report_attachment_id_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_report" ADD CONSTRAINT "ad_report_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_report_agency_project_idx" ON "ad_report" USING btree ("agency_id","project_id","period_start");--> statement-breakpoint
CREATE INDEX "ad_report_client_idx" ON "ad_report" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "deliverable_agency_publish_idx" ON "deliverable" USING btree ("agency_id","publish_at");