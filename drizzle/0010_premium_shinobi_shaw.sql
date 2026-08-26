CREATE TABLE "conversation_quality_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"reviewer_user_id" uuid,
	"source" text DEFAULT 'rules' NOT NULL,
	"score" integer NOT NULL,
	"sentiment" text DEFAULT 'neutral' NOT NULL,
	"intent" text DEFAULT 'other' NOT NULL,
	"summary" text NOT NULL,
	"policy_violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_quality_reviews" ADD CONSTRAINT "conversation_quality_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_quality_reviews" ADD CONSTRAINT "conversation_quality_reviews_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_quality_reviews" ADD CONSTRAINT "conversation_quality_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_quality_reviews_conversation_uq" ON "conversation_quality_reviews" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_quality_reviews_org_score_idx" ON "conversation_quality_reviews" USING btree ("organization_id","score","created_at");