CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"conversation_id" uuid,
	"event_type" text DEFAULT 'won' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversion_events_org_occurred_idx" ON "conversion_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "conversion_events_org_source_idx" ON "conversion_events" USING btree ("organization_id","source","occurred_at");--> statement-breakpoint
CREATE INDEX "conversion_events_contact_idx" ON "conversion_events" USING btree ("organization_id","contact_id");