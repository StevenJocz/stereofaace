CREATE TYPE "public"."radio_authorization" AS ENUM('pending', 'granted', 'denied', 'not_required');--> statement-breakpoint
CREATE TYPE "public"."stream_kind" AS ENUM('hls', 'direct', 'embed');--> statement-breakpoint
CREATE TABLE "radio_station_genres" (
	"station_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "radio_station_genres_station_id_genre_id_pk" PRIMARY KEY("station_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "radio_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"country" text,
	"stream_kind" "stream_kind" DEFAULT 'hls' NOT NULL,
	"stream_url" text,
	"embed_url" text,
	"cors_enabled" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"website_url" text,
	"attribution_name" text NOT NULL,
	"attribution_url" text NOT NULL,
	"attribution_note" text,
	"authorization_status" "radio_authorization" DEFAULT 'pending' NOT NULL,
	"authorization_notes" text,
	"authorization_verified_at" timestamp with time zone,
	"authorization_verified_by" uuid,
	"enabled" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radio_stations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "radio_enabled_requires_authorization" CHECK (NOT "radio_stations"."enabled" OR "radio_stations"."authorization_status" IN ('granted', 'not_required')),
	CONSTRAINT "radio_enabled_requires_source" CHECK (NOT "radio_stations"."enabled" OR ("radio_stations"."stream_kind" = 'embed' AND "radio_stations"."embed_url" IS NOT NULL) OR ("radio_stations"."stream_kind" <> 'embed' AND "radio_stations"."stream_url" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "radio_station_genres" ADD CONSTRAINT "radio_station_genres_station_id_radio_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."radio_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_station_genres" ADD CONSTRAINT "radio_station_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_stations" ADD CONSTRAINT "radio_stations_authorization_verified_by_users_id_fk" FOREIGN KEY ("authorization_verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "radio_stations_enabled_idx" ON "radio_stations" USING btree ("enabled","position");