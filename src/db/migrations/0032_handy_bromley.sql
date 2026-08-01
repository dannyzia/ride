CREATE TYPE "public"."zone_lifecycle_stage" AS ENUM('candidate', 'pilot', 'active', 'growth', 'mature', 'expansion', 'paused', 'closed');--> statement-breakpoint
ALTER TYPE "public"."wallet_rider_transaction_type" ADD VALUE 'upfront_tip';--> statement-breakpoint
ALTER TYPE "public"."wallet_rider_transaction_type" ADD VALUE 'cashback_earn';--> statement-breakpoint
ALTER TYPE "public"."wallet_rider_transaction_type" ADD VALUE 'cashback_redeem';--> statement-breakpoint
ALTER TYPE "public"."wallet_rider_transaction_type" ADD VALUE 'cashback_expire';--> statement-breakpoint
CREATE TABLE "rider_intro_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"ride_number" integer NOT NULL,
	"discount_percent" integer DEFAULT 50 NOT NULL,
	"max_discount_bdt" integer,
	"daily_cap_bdt" integer DEFAULT 10000 NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_budget_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_budget_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"amount_bdt" integer NOT NULL,
	"balance_before_bdt" integer NOT NULL,
	"balance_after_bdt" integer NOT NULL,
	"event" text NOT NULL,
	"reference_id" uuid,
	"reason" text,
	"triggered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"daily_budget_bdt" integer DEFAULT 0 NOT NULL,
	"spent_today_bdt" integer DEFAULT 0 NOT NULL,
	"auto_pause_threshold_pct" integer DEFAULT 100 NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_budgets_zone_id_unique" UNIQUE("zone_id")
);
--> statement-breakpoint
CREATE TABLE "zone_graduation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid,
	"from_stage" text NOT NULL,
	"to_stage" text NOT NULL,
	"min_rides_per_day" integer DEFAULT 0 NOT NULL,
	"max_eta_seconds" integer,
	"min_acceptance_rate_pct" integer,
	"min_driver_utilization_pct" integer,
	"evaluation_window_days" integer DEFAULT 7 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"boundary_geojson" jsonb NOT NULL,
	"lifecycle_stage" "zone_lifecycle_stage" DEFAULT 'candidate' NOT NULL,
	"daily_budget_bdt" integer DEFAULT 0 NOT NULL,
	"changed_by" uuid,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_entries" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
ALTER TABLE "accounting_entries" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "accounting_entries" ADD COLUMN "subsidy_category" text;--> statement-breakpoint
ALTER TABLE "rider_wallet_transactions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "applied_discount_type" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "applied_discount_bdt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "wallet_redeemed_bdt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "lifecycle_stage" "zone_lifecycle_stage" DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "rider_intro_configs" ADD CONSTRAINT "rider_intro_configs_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_budget_logs" ADD CONSTRAINT "zone_budget_logs_zone_budget_id_zone_budgets_id_fk" FOREIGN KEY ("zone_budget_id") REFERENCES "public"."zone_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_budget_logs" ADD CONSTRAINT "zone_budget_logs_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_budget_logs" ADD CONSTRAINT "zone_budget_logs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_budgets" ADD CONSTRAINT "zone_budgets_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_graduation_rules" ADD CONSTRAINT "zone_graduation_rules_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_versions" ADD CONSTRAINT "zone_versions_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_versions" ADD CONSTRAINT "zone_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rider_intro_configs_zone_ride_idx" ON "rider_intro_configs" USING btree ("zone_id","ride_number");--> statement-breakpoint
CREATE INDEX "rider_intro_configs_active_idx" ON "rider_intro_configs" USING btree ("is_active","created_at") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX "zone_budget_logs_zone_idx" ON "zone_budget_logs" USING btree ("zone_id","created_at");--> statement-breakpoint
CREATE INDEX "zone_budget_logs_budget_idx" ON "zone_budget_logs" USING btree ("zone_budget_id","created_at");--> statement-breakpoint
CREATE INDEX "zone_budgets_zone_idx" ON "zone_budgets" USING btree ("zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zone_grad_rules_zone_stages_idx" ON "zone_graduation_rules" USING btree ("zone_id","from_stage","to_stage");--> statement-breakpoint
CREATE UNIQUE INDEX "zone_versions_zone_version_idx" ON "zone_versions" USING btree ("zone_id","version_number");--> statement-breakpoint
CREATE INDEX "zone_versions_zone_idx" ON "zone_versions" USING btree ("zone_id");--> statement-breakpoint
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rwt_expires_active_idx" ON "rider_wallet_transactions" USING btree ("expires_at") WHERE expires_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "rwt_rider_expires_idx" ON "rider_wallet_transactions" USING btree ("rider_id","expires_at") WHERE expires_at IS NOT NULL;