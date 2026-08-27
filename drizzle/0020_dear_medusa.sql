ALTER TABLE "campaign_recipients" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "last_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "api_message_id" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "api_provider_message_id" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "last_api_request_id" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "channel_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "rate_limit_per_minute" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "send_window_start" text DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "send_window_end" text DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "queued_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "daily_sent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "daily_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "sent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "delivered_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "failed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "skipped_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_idempotency_uq" ON "campaign_recipients" USING btree ("organization_id","campaign_id","last_idempotency_key");--> statement-breakpoint
CREATE INDEX "campaigns_channel_status_idx" ON "campaigns" USING btree ("channel_connection_id","status");