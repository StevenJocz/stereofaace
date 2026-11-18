ALTER TYPE "public"."role" ADD VALUE 'oyente';--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "space_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "space_favorite_artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"artist_id" uuid,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_genre_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "space_genre_options_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "space_profile_genres" (
	"user_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "space_profile_genres_user_id_genre_id_pk" PRIMARY KEY("user_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "space_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"location" text,
	"tagline" text,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"privacy" jsonb DEFAULT '{"listed":true,"showLocation":true,"showJoined":true,"showLinks":true,"showFavorites":true}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"avatar_asset_id" uuid,
	"cover_asset_id" uuid,
	"draft_design" jsonb,
	"published_design" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_user_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"design" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "space_themes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_assets" ADD CONSTRAINT "space_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_favorite_artists" ADD CONSTRAINT "space_favorite_artists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_favorite_artists" ADD CONSTRAINT "space_favorite_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_profile_genres" ADD CONSTRAINT "space_profile_genres_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_profile_genres" ADD CONSTRAINT "space_profile_genres_genre_id_space_genre_options_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."space_genre_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_profiles" ADD CONSTRAINT "space_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reports" ADD CONSTRAINT "space_reports_profile_user_id_users_id_fk" FOREIGN KEY ("profile_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reports" ADD CONSTRAINT "space_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_user_idx" ON "auth_tokens" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "space_assets_user_idx" ON "space_assets" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "space_fav_artists_user_idx" ON "space_favorite_artists" USING btree ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "space_profiles_username_idx" ON "space_profiles" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "space_profiles_status_idx" ON "space_profiles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "space_profiles_featured_idx" ON "space_profiles" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "space_reports_status_idx" ON "space_reports" USING btree ("status","created_at");