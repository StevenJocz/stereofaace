CREATE TABLE "studio_carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"color" text DEFAULT '#c6ff00' NOT NULL,
	"hotkey" text,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"duration_sec" real,
	"gain_db" real DEFAULT 0 NOT NULL,
	"duck" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "studio_carts_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "studio_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"artist" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"dj_name" text,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "studio_playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radio_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"hosts" text,
	"dj_username" text,
	"photo_id" uuid,
	"color" text DEFAULT '#c6ff00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "radio_programs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "radio_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"weekday" integer,
	"date" date,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_carts" ADD CONSTRAINT "studio_carts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_history" ADD CONSTRAINT "studio_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_playlists" ADD CONSTRAINT "studio_playlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_programs" ADD CONSTRAINT "radio_programs_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_schedule" ADD CONSTRAINT "radio_schedule_program_id_radio_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."radio_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_carts_position_idx" ON "studio_carts" USING btree ("position");--> statement-breakpoint
CREATE INDEX "studio_history_played_idx" ON "studio_history" USING btree ("played_at");--> statement-breakpoint
CREATE INDEX "studio_playlists_owner_idx" ON "studio_playlists" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "radio_schedule_program_idx" ON "radio_schedule" USING btree ("program_id");