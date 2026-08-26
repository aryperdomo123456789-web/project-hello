CREATE TABLE "plan_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"connections" integer DEFAULT 1 NOT NULL,
	"agents" integer DEFAULT 1 NOT NULL,
	"monthly_messages" integer DEFAULT 0 NOT NULL,
	"active_flows" integer DEFAULT 0 NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_catalog_items" ADD CONSTRAINT "plan_catalog_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_catalog_org_plan_uq" ON "plan_catalog_items" USING btree ("organization_id","plan_id");--> statement-breakpoint
CREATE INDEX "plan_catalog_org_active_idx" ON "plan_catalog_items" USING btree ("organization_id","is_active");