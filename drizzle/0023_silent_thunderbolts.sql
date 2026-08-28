ALTER TABLE "campaigns" ADD COLUMN "pacing_min_seconds" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pacing_max_seconds" integer DEFAULT 25 NOT NULL;