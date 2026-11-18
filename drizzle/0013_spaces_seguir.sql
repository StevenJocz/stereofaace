CREATE TABLE "space_follows" (
	"follower_id" uuid NOT NULL,
	"followed_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_follows_follower_id_followed_id_pk" PRIMARY KEY("follower_id","followed_id"),
	CONSTRAINT "space_follows_not_self" CHECK ("space_follows"."follower_id" <> "space_follows"."followed_id")
);
--> statement-breakpoint
ALTER TABLE "space_profiles" ALTER COLUMN "privacy" SET DEFAULT '{"listed":true,"showLocation":true,"showJoined":true,"showLinks":true,"showFavorites":true,"showFollows":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "space_follows" ADD CONSTRAINT "space_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_follows" ADD CONSTRAINT "space_follows_followed_id_users_id_fk" FOREIGN KEY ("followed_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_follows_followed_idx" ON "space_follows" USING btree ("followed_id");