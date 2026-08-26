CREATE TABLE "conversation_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"source" text DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_ratings" ADD CONSTRAINT "conversation_ratings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_ratings" ADD CONSTRAINT "conversation_ratings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_ratings_conversation_uq" ON "conversation_ratings" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_ratings_org_created_idx" ON "conversation_ratings" USING btree ("organization_id","created_at");