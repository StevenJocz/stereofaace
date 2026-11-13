CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"network" text NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_posts_article_network_unique" UNIQUE("article_id","network")
);
--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_posts_status_idx" ON "social_posts" USING btree ("status");