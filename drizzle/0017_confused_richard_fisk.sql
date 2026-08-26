CREATE TYPE "public"."integration_provider" AS ENUM('deepseek', 'gemini', 'groq', 'cohere', 'tavily', 'jina', 'openrouter', 'mistral', 'huggingface', 'cloudflare_workers', 'firecrawl', 'exa', 'langfuse', 'siliconflow', 'whisper', 'lamatok', 'mercadopago', 'evolution', 'meta_cloud', 'custom');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('not_configured', 'configured', 'healthy', 'degraded', 'error', 'disabled');--> statement-breakpoint
CREATE TABLE "provider_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"credentials_encrypted" text,
	"endpoint_url" text,
	"model" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "integration_status" DEFAULT 'not_configured' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD CONSTRAINT "provider_integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD CONSTRAINT "provider_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD CONSTRAINT "provider_integrations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_integrations_org_provider_uq" ON "provider_integrations" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "provider_integrations_org_status_idx" ON "provider_integrations" USING btree ("organization_id","status");