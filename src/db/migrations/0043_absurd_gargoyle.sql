CREATE TYPE "public"."body_type" AS ENUM('motorcycle', 'scooter', 'auto_rickshaw', 'hatchback', 'sedan', 'crossover', 'suv', 'suv_large', 'mpv', 'van', 'minibus');--> statement-breakpoint
ALTER TYPE "public"."vehicle_type" ADD VALUE 'car_compact' BEFORE 'car_economy';--> statement-breakpoint
CREATE TABLE "vehicle_premium_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" varchar(100) NOT NULL,
	"model" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD COLUMN "body_type" "body_type";--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "engine_cc" integer;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "body_type" "body_type";--> statement-breakpoint
ALTER TABLE "vehicle_premium_allowlist" ADD CONSTRAINT "vehicle_premium_allowlist_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vpa_brand_idx" ON "vehicle_premium_allowlist" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "vpa_brand_model_idx" ON "vehicle_premium_allowlist" USING btree ("brand","model");--> statement-breakpoint
CREATE INDEX "vpa_active_idx" ON "vehicle_premium_allowlist" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "vpa_brand_only_unique" ON "vehicle_premium_allowlist" USING btree (LOWER("brand")) WHERE model IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "vpa_brand_model_unique" ON "vehicle_premium_allowlist" USING btree (LOWER("brand"),LOWER("model")) WHERE model IS NOT NULL;