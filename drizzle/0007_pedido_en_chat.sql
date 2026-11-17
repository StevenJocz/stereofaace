ALTER TABLE "chat_messages" ADD COLUMN "kind" text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "artist" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "song_requests" ADD COLUMN "note" text;