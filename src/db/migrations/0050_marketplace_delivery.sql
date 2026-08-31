-- Marketplace Phase 3: Delivery (schema from src/db/schema.ts)
-- Enums: courier_type, delivery_status, delivery_vehicle_type
-- Tables: couriers, delivery_requests, delivery_bids, delivery_legs
-- NOTE: hand-authored (drizzle-kit generate requires TTY).

-- Enums (IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE "courier_type" AS ENUM ('parcel','food');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "delivery_status" AS ENUM ('pending','assigned','picked_up','in_transit','delivered','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "delivery_vehicle_type" AS ENUM ('bike','cng','car','van','truck');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- couriers (F29 — capability table, ruling 5, ruling 11)
CREATE TABLE "couriers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "courier_type" "courier_type" NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "is_online" boolean NOT NULL DEFAULT false,
  "last_lat" numeric(10,7),
  "last_lng" numeric(10,7),
  "last_seen_at" timestamptz,
  "completed_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- F44/ruling 11: dual capabilities allowed (one parcel + one food per account)
CREATE UNIQUE INDEX "couriers_user_type_idx" ON "couriers" ("user_id","courier_type");
--> statement-breakpoint
CREATE INDEX "couriers_type_status_idx" ON "couriers" ("courier_type","status");

-- delivery_requests (A.3 — A→B courier leg)
CREATE TABLE "delivery_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "source_shop_order_id" uuid REFERENCES "shop_orders"("id"),
  "status" "delivery_status" NOT NULL DEFAULT 'pending',
  "pickup_address" text NOT NULL,
  "pickup_lat" numeric(9,6) NOT NULL,
  "pickup_lng" numeric(9,6) NOT NULL,
  "dropoff_address" text NOT NULL,
  "dropoff_lat" numeric(9,6) NOT NULL,
  "dropoff_lng" numeric(9,6) NOT NULL,
  "package_description" text,
  "package_weight_kg" integer,
  "required_vehicle_type" "delivery_vehicle_type",
  "declared_fee_bdt" integer,
  "quoted_fee_bdt" integer,
  "accepted_bid_id" uuid,
  "accepted_at" timestamptz,
  "picked_up_at" timestamptz,
  "delivered_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "cancelled_by" varchar(10),
  "deadline_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "delivery_requests_creator_idx" ON "delivery_requests" ("created_by_user_id");
--> statement-breakpoint
CREATE INDEX "delivery_requests_status_idx" ON "delivery_requests" ("status");
--> statement-breakpoint
CREATE INDEX "delivery_requests_deadline_idx" ON "delivery_requests" ("deadline_at") WHERE "status" = 'pending';

-- delivery_bids (F3 — partial unique for withdraw+resubmit)
CREATE TABLE "delivery_bids" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL REFERENCES "delivery_requests"("id") ON DELETE CASCADE,
  "courier_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "vehicle_type" "delivery_vehicle_type",
  "quoted_fee_bdt" integer NOT NULL,
  "quoted_eta_minutes" integer,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "settled_at" timestamptz
);
--> statement-breakpoint
-- F3: partial unique — allows withdraw+resubmit
CREATE UNIQUE INDEX "delivery_bids_active_courier_idx" ON "delivery_bids" ("request_id","courier_user_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX "delivery_bids_courier_status_idx" ON "delivery_bids" ("courier_user_id","status");

-- delivery_legs (F42 — hot-path index for §B.7 scans)
CREATE TABLE "delivery_legs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL REFERENCES "delivery_requests"("id") ON DELETE CASCADE,
  "courier_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "leg_state" "delivery_status" NOT NULL DEFAULT 'pending',
  "started_at" timestamptz,
  "picked_up_at" timestamptz,
  "delivered_at" timestamptz,
  "pod_url" text,
  "failure_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- F42: hot-path index for §B.7 scans
CREATE INDEX "delivery_legs_courier_state_idx" ON "delivery_legs" ("courier_user_id","leg_state");
--> statement-breakpoint
CREATE INDEX "delivery_legs_request_idx" ON "delivery_legs" ("request_id");
