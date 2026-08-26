CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_retention_days" integer DEFAULT 365 NOT NULL,
	"webhook_retention_days" integer DEFAULT 90 NOT NULL,
	"audit_retention_days" integer DEFAULT 730 NOT NULL,
	"quality_retention_days" integer DEFAULT 730 NOT NULL,
	"sequence_retention_days" integer DEFAULT 365 NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"dry_run_only" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"cutoff" jsonb NOT NULL,
	"counts" jsonb NOT NULL,
	"requested_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retention_policies_org_uq" ON "retention_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_runs_idempotency_uq" ON "retention_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "retention_runs_org_created_idx" ON "retention_runs" USING btree ("organization_id","created_at");