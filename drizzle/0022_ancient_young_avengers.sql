ALTER TABLE "campaigns" ADD COLUMN "circuit_state" text DEFAULT 'closed' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "circuit_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "circuit_reason" text;