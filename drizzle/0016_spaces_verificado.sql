ALTER TABLE "space_profiles" ADD COLUMN "badge_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "space_profiles" ADD COLUMN "badge_verified_by" uuid;--> statement-breakpoint
ALTER TABLE "space_profiles" ADD CONSTRAINT "space_profiles_badge_verified_by_users_id_fk" FOREIGN KEY ("badge_verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;