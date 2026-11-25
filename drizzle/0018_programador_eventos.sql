CREATE TABLE "studio_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"minute_of_day" integer NOT NULL,
	"days" jsonb DEFAULT '[1,2,3,4,5,6,7]'::jsonb NOT NULL,
	"mode" text DEFAULT 'delayed' NOT NULL,
	"transition" text DEFAULT 'fade' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_events" ADD CONSTRAINT "studio_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_events_minute_idx" ON "studio_events" USING btree ("minute_of_day");