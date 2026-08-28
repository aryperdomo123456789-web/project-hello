CREATE TABLE "contact_blacklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"reason" text DEFAULT 'manual' NOT NULL,
	"banned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contact_blacklist" ADD CONSTRAINT "contact_blacklist_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_blacklist_org_phone_uq" ON "contact_blacklist" USING btree ("organization_id","phone_e164");--> statement-breakpoint
CREATE INDEX "contact_blacklist_active_idx" ON "contact_blacklist" USING btree ("organization_id","expires_at");