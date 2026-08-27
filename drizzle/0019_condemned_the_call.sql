ALTER TYPE "public"."integration_provider" ADD VALUE 'mago_bot_api' BEFORE 'evolution';--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "api_tenant_id" text;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "api_project_id" text;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "api_resource_id" text;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "api_channel_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "api_message_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "api_provider_message_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "last_api_request_id" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "event_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_org_api_channel_uq" ON "channel_connections" USING btree ("organization_id","api_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_org_api_message_uq" ON "messages" USING btree ("organization_id","api_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_id_uq" ON "webhook_events" USING btree ("provider","event_id");