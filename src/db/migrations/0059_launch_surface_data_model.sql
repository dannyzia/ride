-- Launch surfaces (S1) — data model: shop category lookup, shop extensions,
-- workshop services/slots, workshop booking columns, universal delivery legs.
-- Uses the enum values added by 0058 (run 0058 first).
-- Hand-authored (drizzle-kit generate requires TTY — see 0048 note).
--
-- SECURITY POSTURE (Amendment 3 D1 — regression risk, do not skip):
--   Supabase DEFAULT PRIVILEGES re-grant anon+authenticated on every NEW table
--   unless a migration revokes them, which would undo the 125/125-table
--   RLS-hardening posture (enabled + forced, ZERO anon/authenticated grants).
--   Every NEW table in this file therefore ships ENABLE + FORCE RLS + REVOKE
--   in this same file. Verify post-migration with the posture query:
--     SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
--       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--      WHERE n.nspname = 'public' AND c.relname IN
--        ('shop_types','workshop_services','workshop_slots','deliveries');
--   Expect rowsecurity = true, relforcerowsecurity = true, and
--   has_table_privilege('anon', <t>, 'SELECT') = false for each.

-- ════════════════════════════════════════════════════════════════════
-- 1. New enums (value additions to EXISTING enums are in 0058)
-- ════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE "delivery_source" AS ENUM ('food_order','shop_order','workshop_booking','parcel');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "delivery_leg_status" AS ENUM ('created','offered','accepted','picked_up','delivered','failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- 2. shop_types — admin-extensible category lookup (owner ruling: a seeded
--    LOOKUP TABLE the admin extends, NOT a Postgres enum)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "shop_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(60) NOT NULL UNIQUE,
  "label_en" varchar(120) NOT NULL,
  "label_bn" varchar(120) NOT NULL,
  "is_restaurant" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shop_types_active_sort_idx" ON "shop_types" ("active","sort_order");
--> statement-breakpoint

-- Seed: the three launch categories. The good-morning screen reads this
-- table, so admin-added types appear with zero client change.
INSERT INTO "shop_types" ("slug","label_en","label_bn","is_restaurant","sort_order","active") VALUES
  ('restaurant', 'Restaurant', 'রেস্তোরাঁ', true, 10, true),
  ('vehicle_parts_workshop', 'Vehicle Parts & Workshops', 'যানবাহনের পার্টস ও ওয়ার্কশপ', false, 20, true),
  ('grocery_general', 'General & Grocery', 'জেনারেল ও গ্রোসারি', false, 30, true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- 3. shops — category + verification documents + rating (mission §1)
--    Status semantics (recorded divergence from the ruling's literal
--    "status enum (pending → verified → suspended)": the live column is
--    varchar used by 6 verticals):
--      pending   = status 'pending'   & is_verified = false
--      verified  = status 'active'    & is_verified = true
--      suspended = status 'suspended'
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "shop_type_id" uuid REFERENCES "shop_types"("id");
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "license_url" text;
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "food_safety_cert_url" text;
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "rating" numeric(3,2);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "rating_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shops_type_idx" ON "shops" ("shop_type_id");
--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- 4. Workshop services + bookable slots (mission §1)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "workshop_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" uuid NOT NULL REFERENCES "shops"("id"),
  "name" varchar(200) NOT NULL,
  "description" text,
  "price_bdt" integer NOT NULL,
  "duration_minutes" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_services_shop_idx" ON "workshop_services" ("shop_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" uuid NOT NULL REFERENCES "shops"("id"),
  "service_id" uuid REFERENCES "workshop_services"("id"),
  "starts_at" timestamptz NOT NULL,
  "capacity" integer NOT NULL DEFAULT 1,
  "booked_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workshop_slots_capacity_check" CHECK (capacity >= 1 AND booked_count >= 0 AND booked_count <= capacity)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_slots_shop_idx" ON "workshop_slots" ("shop_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_slots_service_idx" ON "workshop_slots" ("service_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_slots_starts_idx" ON "workshop_slots" ("starts_at");
--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- 5. shop_orders — workshop booking = an order in THIS table with an
--    attached slot (owner ruling: order kind 'service_booking', no
--    parallel ordering system)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "order_kind" varchar(20) NOT NULL DEFAULT 'catalog';
--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "slot_id" uuid REFERENCES "workshop_slots"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shop_orders_kind_idx" ON "shop_orders" ("shop_id","order_kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shop_orders_slot_idx" ON "shop_orders" ("slot_id");
--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- 6. deliveries — THE universal legs table (amendment §1 + Amendment 2)
--    One leg, one taker, first-accept-wins across delivery men AND drivers
--    with the toggle on. No per-vertical courier tables.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" "delivery_source" NOT NULL,
  "order_id" uuid NOT NULL,
  "pickup_shop_id" uuid REFERENCES "shops"("id"),
  "pickup_address" text NOT NULL,
  "pickup_lat" numeric(9,6) NOT NULL,
  "pickup_lng" numeric(9,6) NOT NULL,
  "dropoff_address" text NOT NULL,
  "dropoff_lat" numeric(9,6) NOT NULL,
  "dropoff_lng" numeric(9,6) NOT NULL,
  "delivery_fee_bdt" integer NOT NULL,
  "status" "delivery_leg_status" NOT NULL DEFAULT 'created',
  "delivery_man_user_id" uuid REFERENCES "users"("id"),
  "accepted_at" timestamptz,
  "delivered_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- D3: composite geo indexes for the bounding-box nearby-legs query
CREATE INDEX IF NOT EXISTS "deliveries_pickup_geo_idx" ON "deliveries" ("pickup_lat","pickup_lng");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_dropoff_geo_idx" ON "deliveries" ("dropoff_lat","dropoff_lng");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_status_created_idx" ON "deliveries" ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_order_idx" ON "deliveries" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_claimer_idx" ON "deliveries" ("delivery_man_user_id");
--> statement-breakpoint
-- API-B single-claim guard: one ACTIVE leg per claimer. Terminal states
-- (delivered/failed) excluded so completed history never blocks the next
-- accept; the accept endpoint does the single-winner conditional UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_active_claimer_uidx"
  ON "deliveries" ("delivery_man_user_id")
  WHERE status IN ('accepted','picked_up');
--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- 7. SECURITY POSTURE — every NEW table above (D1, same file as the DDL)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "shop_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shop_types" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "shop_types" FROM anon, authenticated;
--> statement-breakpoint
ALTER TABLE "workshop_services" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workshop_services" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "workshop_services" FROM anon, authenticated;
--> statement-breakpoint
ALTER TABLE "workshop_slots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workshop_slots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "workshop_slots" FROM anon, authenticated;
--> statement-breakpoint
ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "deliveries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "deliveries" FROM anon, authenticated;
--> statement-breakpoint
