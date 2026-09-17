ALTER TABLE "file_version" ADD COLUMN "poster_frame_url" text;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "thumbnail_sprite_url" text;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "sprite_interval_ms" integer;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "sprite_columns" integer;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "sprite_rows" integer;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "sprite_cell_width" integer;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "sprite_cell_height" integer;--> statement-breakpoint
ALTER TABLE "file_version" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "resolved_by_user_id" text;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;