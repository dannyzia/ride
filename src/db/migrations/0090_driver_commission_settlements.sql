-- Migration: 0090_driver_commission_settlements.sql
-- Commission & Hybrid Revenue Engine — Phase 1.
--
-- 1) payment_events.purpose widens 20 -> 40. The new value
--    'commission_settlement' is 21 characters; on the old varchar(20) every
--    dues-settlement IPN insert would fail with "value too long".
-- 2) driver_commission_settlements is the settlement ledger: money a driver
--    actually PAID toward accrued per-ride commission (revenue_model
--    commission_only / hybrid). amount_bdt is integer paisa. One row per
--    payment_event (unique index) is the idempotency backstop for the
--    callback/repair path.
-- 3) revenue-model config seeds. 'subscription_only' is the safe default: it
--    reproduces pre-commission dispatch exactly until an admin toggles the
--    model. Seeds, not constants (AGENTS.md platform_config rule).
--
-- Standard posture for a new money table: ENABLE + FORCE RLS + REVOKE ALL
-- from anon/authenticated (Supabase default privileges re-grant new tables).
--
-- Hand-crafted migration following Ride strict schema standards.

ALTER TABLE "payment_events" ALTER COLUMN "purpose" TYPE varchar(40);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "driver_commission_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id" uuid NOT NULL REFERENCES "drivers"("id") ON DELETE cascade,
  "payment_event_id" uuid NOT NULL REFERENCES "payment_events"("id"),
  "amount_bdt" integer NOT NULL,
  "status" varchar(20) DEFAULT 'completed' NOT NULL,
  "provider" "payment_provider" DEFAULT 'portpos' NOT NULL,
  "provider_txn_id" varchar(255),
  "settled_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dcs_driver_settled_idx"
  ON "driver_commission_settlements" ("driver_id", "settled_at");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "dcs_payment_event_idx"
  ON "driver_commission_settlements" ("payment_event_id");
--> statement-breakpoint

ALTER TABLE "driver_commission_settlements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "driver_commission_settlements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "driver_commission_settlements" FROM anon, authenticated;
--> statement-breakpoint

INSERT INTO platform_config (key, value, updated_at) VALUES
  ('revenue_model', 'subscription_only', now()),
  ('max_commission_debt_bdt', '50000', now()),
  ('commission_debt_grace_rides', '3', now())
ON CONFLICT (key) DO NOTHING;
