-- Marketplace Phase 2: Rental Bidding (schema from src/db/schema.ts)
-- Enums: rental_category, rental_urgency, rental_request_status, rental_bid_status, rental_vehicle_type
-- Tables: rental_requests, rental_bids, awarded_bid_assignments, fleet_service_zones, rental_request_events
-- NOTE: hand-authored (drizzle-kit generate requires TTY — see 0047/0048 notes).

-- Enums (IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE "rental_category" AS ENUM ('car_rental','truck_rental','ambulance_scheduled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "rental_urgency" AS ENUM ('standard','alarm');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "rental_request_status" AS ENUM ('broadcasting','collecting','awarded','confirmed','completed','cancelled','expired','no_bidders');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "rental_bid_status" AS ENUM ('active','withdrawn','superseded','won','lost','expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "rental_vehicle_type" AS ENUM ('pickup','mini_truck','medium_truck','heavy_truck','trailer','van','ambulance_basic','ambulance_advanced');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- rental_requests
CREATE TABLE "rental_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category" "rental_category" NOT NULL,
  "urgency" "rental_urgency" NOT NULL DEFAULT 'standard',
  "rider_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" "rental_request_status" NOT NULL DEFAULT 'broadcasting',
  "pickup_address" text NOT NULL,
  "pickup_lat" numeric(9,6) NOT NULL,
  "pickup_lng" numeric(9,6) NOT NULL,
  "dropoff_address" text NOT NULL,
  "dropoff_lat" numeric(9,6) NOT NULL,
  "dropoff_lng" numeric(9,6) NOT NULL,
  "cargo_tags" text[],
  "cargo_weight_kg" integer,
  "cargo_volume_m3" numeric(10,3),
  "cargo_description" text,
  "requested_vehicle_type" "rental_vehicle_type",
  "patient_condition" text,
  "requires_paramedic" boolean,
  "service_level" varchar(5),
  "bidding_window_seconds" integer NOT NULL DEFAULT 1200,
  "soft_deadline_at" timestamptz NOT NULL,
  "awarded_bid_id" uuid,
  "awarded_at" timestamptz,
  "reselect_deadline_at" timestamptz,
  "confirmation_deadline_at" timestamptz,
  "fleet_ack_at" timestamptz,
  "confirmed_at" timestamptz,
  "tracking_required" boolean NOT NULL DEFAULT false,
  "negotiated_terms" text,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "cancelled_by" varchar(10),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "rental_requests_rider_idx" ON "rental_requests" ("rider_user_id");
--> statement-breakpoint
CREATE INDEX "rental_requests_status_idx" ON "rental_requests" ("status");
--> statement-breakpoint
CREATE INDEX "rental_requests_cat_status_idx" ON "rental_requests" ("category","status");
--> statement-breakpoint
-- Partial indexes for scheduler deadline sweeps (jobs 46-48)
CREATE INDEX "rental_requests_soft_deadline_idx" ON "rental_requests" ("soft_deadline_at") WHERE "status" IN ('broadcasting','collecting') AND "awarded_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "rental_requests_reselect_idx" ON "rental_requests" ("reselect_deadline_at") WHERE "status" = 'collecting' AND "reselect_deadline_at" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "rental_requests_confirm_idx" ON "rental_requests" ("confirmation_deadline_at") WHERE "status" = 'awarded' AND "confirmation_deadline_at" IS NOT NULL;

-- rental_bids
CREATE TABLE "rental_bids" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL REFERENCES "rental_requests"("id") ON DELETE CASCADE,
  "submitted_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "fleet_id" uuid NOT NULL REFERENCES "fleets"("id"),
  "driver_user_id" uuid REFERENCES "users"("id"),
  "vehicle_id" uuid REFERENCES "vehicles"("id"),
  "vehicle_type" "rental_vehicle_type" NOT NULL,
  "quoted_price_bdt" integer NOT NULL,
  "quoted_notes" text,
  "status" "rental_bid_status" NOT NULL DEFAULT 'active',
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "withdrawn_at" timestamptz,
  "withdrawn_by_user_id" uuid REFERENCES "users"("id"),
  "expired_at" timestamptz,
  "settled_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rental_bids_active_fleet_idx" ON "rental_bids" ("request_id","fleet_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX "rental_bids_fleet_status_idx" ON "rental_bids" ("fleet_id","status");

-- awarded_bid_assignments
CREATE TABLE "awarded_bid_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL REFERENCES "rental_requests"("id") ON DELETE CASCADE,
  "winning_bid_id" uuid NOT NULL,
  "fleet_id" uuid NOT NULL REFERENCES "fleets"("id"),
  "assigned_driver_user_id" uuid,
  "assigned_vehicle_id" uuid,
  "assigned_by_user_id" uuid,
  "assignment_deadline_at" timestamptz NOT NULL,
  "assigned_at" timestamptz,
  "released_at" timestamptz,
  "release_reason" varchar(30),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "awarded_bid_assignments_live_idx" ON "awarded_bid_assignments" ("request_id") WHERE "released_at" IS NULL;

-- fleet_service_zones
CREATE TABLE "fleet_service_zones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fleet_id" uuid NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "h3_cell" varchar(20) NOT NULL,
  "resolution" smallint NOT NULL DEFAULT 8,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_service_zones_fleet_cell_idx" ON "fleet_service_zones" ("fleet_id","h3_cell");
--> statement-breakpoint
CREATE INDEX "fleet_service_zones_fleet_idx" ON "fleet_service_zones" ("fleet_id");
--> statement-breakpoint
CREATE INDEX "fleet_service_zones_active_idx" ON "fleet_service_zones" ("fleet_id","is_active");

-- rental_request_events (append-only, no updated_at)
CREATE TABLE "rental_request_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL REFERENCES "rental_requests"("id") ON DELETE CASCADE,
  "event_type" varchar(50) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "rental_request_events_req_idx" ON "rental_request_events" ("request_id","created_at");

-- ══════════════════════════════════════════════════════════════
-- FIXUP: Partial indexes (for already-pushed dev DB)
-- Drop the hard uniques that were applied by drizzle-kit push,
-- replace with correct partial uniques per spec §A.2.
-- ══════════════════════════════════════════════════════════════

-- rental_bids: drop hard unique, create partial WHERE status='active' (F35 withdraw+resubmit)
DROP INDEX IF EXISTS "rental_bids_active_fleet_idx";
CREATE UNIQUE INDEX "rental_bids_active_fleet_idx" ON "rental_bids" ("request_id","fleet_id") WHERE "status" = 'active';

-- awarded_bid_assignments: drop hard unique, create partial WHERE released_at IS NULL (F36 demote→re-award)
DROP INDEX IF EXISTS "awarded_bid_assignments_live_idx";
CREATE UNIQUE INDEX "awarded_bid_assignments_live_idx" ON "awarded_bid_assignments" ("request_id") WHERE "released_at" IS NULL;

-- rental_requests: add 3 missing partial indexes for scheduler deadline sweeps (jobs 46-48)
CREATE INDEX IF NOT EXISTS "rental_requests_soft_deadline_idx" ON "rental_requests" ("soft_deadline_at") WHERE "status" IN ('broadcasting','collecting') AND "awarded_at" IS NULL;
CREATE INDEX IF NOT EXISTS "rental_requests_reselect_idx" ON "rental_requests" ("reselect_deadline_at") WHERE "status" = 'collecting' AND "reselect_deadline_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "rental_requests_confirm_idx" ON "rental_requests" ("confirmation_deadline_at") WHERE "status" = 'awarded' AND "confirmation_deadline_at" IS NOT NULL;
