-- Plan 27 §1/§11 corrections (S1):
--   R4: workshop_requests replaces the workshop_slots capacity grid
--   R5: shops.is_open (server-side open/closed toggle)
--   §1: shop_members.invited_by, deliveries.dropoff_user_id,
--       deliveries.source renamed to source_vertical
-- Hand-authored (see 0048 note). Idempotent throughout.
--
-- SECURITY POSTURE (D1): workshop_requests is a NEW table and ships
-- ENABLE + FORCE RLS + REVOKE in this same file. The ALTERed tables
-- (shops, shop_members, deliveries) re-assert REVOKE defensively — default
-- privileges fire on CREATE, not ALTER, but the zero-grant posture is cheap
-- to restate. Post-migration probe: forced=✓, grants=0 for workshop_requests.

DO $$ BEGIN
  CREATE TYPE "workshop_request_status" AS ENUM ('requested','confirmed','in_progress','done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "workshop_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" uuid NOT NULL REFERENCES "shops"("id"),
  "service_id" uuid NOT NULL REFERENCES "workshop_services"("id"),
  "customer_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "requested_date" date NOT NULL,
  "window_start" time NOT NULL,
  "window_end" time NOT NULL,
  "note" text,
  "status" "workshop_request_status" NOT NULL DEFAULT 'requested',
  "order_id" uuid REFERENCES "shop_orders"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workshop_requests_window_check" CHECK (window_end > window_start)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_requests_shop_status_idx" ON "workshop_requests" ("shop_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_requests_customer_idx" ON "workshop_requests" ("customer_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_requests_service_idx" ON "workshop_requests" ("service_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_requests_order_idx" ON "workshop_requests" ("order_id");
--> statement-breakpoint

-- R5: open/closed toggle (server rejects new orders when closed — S3 enforces)
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "is_open" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
REVOKE ALL ON "shops" FROM anon, authenticated;
--> statement-breakpoint

-- §1: who invited this staff member (R10: invites are MANAGER|STAFF only)
ALTER TABLE "shop_members" ADD COLUMN IF NOT EXISTS "invited_by" uuid REFERENCES "users"("id");
--> statement-breakpoint
REVOKE ALL ON "shop_members" FROM anon, authenticated;
--> statement-breakpoint

-- §1: dropoff customer ref + column rename source -> source_vertical
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "dropoff_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint
-- Conditional rename: the dev DB carried `source` (created by 0059 before the
-- §1 rename), while a fresh DB built by `drizzle-kit push` already has
-- `source_vertical` straight from schema.ts. Both histories must replay clean.
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'source'
  ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'source_vertical'
  ) THEN
    ALTER TABLE public.deliveries RENAME COLUMN source TO source_vertical;
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON "deliveries" FROM anon, authenticated;
--> statement-breakpoint

-- R4: drop the slot-capacity grid (created in 0059 before the §11 review
-- corrections landed). Drop the referencing column first, then the table.
ALTER TABLE "shop_orders" DROP COLUMN IF EXISTS "slot_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "shop_orders_slot_idx";
--> statement-breakpoint
DROP TABLE IF EXISTS "workshop_slots";
--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- SECURITY POSTURE — new table above (D1, same file as the DDL)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "workshop_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workshop_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "workshop_requests" FROM anon, authenticated;
--> statement-breakpoint
