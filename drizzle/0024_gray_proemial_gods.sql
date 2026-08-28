ALTER TABLE "organizations" ADD COLUMN "billing_subscription_ref" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_price_ref" text;--> statement-breakpoint
ALTER TABLE "plan_catalog_items" ADD COLUMN "stripe_price_id" text;