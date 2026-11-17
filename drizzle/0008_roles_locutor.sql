ALTER TYPE "public"."role" ADD VALUE 'locutor';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dj_username" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_dj_username_idx" ON "users" USING btree ("dj_username");