CREATE TABLE "cancellation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"canceller_role" varchar(20) NOT NULL,
	"ride_status" varchar(30) NOT NULL,
	"time_threshold_seconds" integer NOT NULL,
	"fee_type" varchar(10) NOT NULL,
	"fee_amount_bdt" integer NOT NULL,
	"max_fee_bdt" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surge_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"multiplier" numeric(4, 2) NOT NULL,
	"demand_count" integer NOT NULL,
	"supply_count" integer NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "surge_history" ADD CONSTRAINT "surge_history_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;