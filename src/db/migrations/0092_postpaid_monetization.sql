-- Migration: 0092_postpaid_monetization.sql
-- Stage 1 of the postpaid monetization rollout (DESIGN-POSTPAID-MONETIZATION.md §3.2, §5 Items 1-2).
-- All changes are additive: new enums, columns, tables, indexes, and one view.
-- Existing code reads none of this until Stage 2/3 land; revenue_model stays 'subscription_only'.
-- Standard posture: ENABLE + FORCE RLS + REVOKE ALL from anon/authenticated (server-side access only).

-- S1: package_product_type enum + packages.product_type (NOT NULL DEFAULT 'call_package').
-- duration_days becomes nullable: the ৳0 commission package is non-expiring (D3).
CREATE TYPE package_product_type AS ENUM ('call_package', 'commission');
ALTER TABLE packages ADD COLUMN product_type package_product_type NOT NULL DEFAULT 'call_package';
ALTER TABLE packages ALTER COLUMN duration_days DROP NOT NULL;

-- S2: driver_bills — the platform's receivable for granted call packages.
CREATE TABLE IF NOT EXISTS driver_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  driver_id uuid NOT NULL REFERENCES drivers(id),
  subscription_id uuid REFERENCES subscriptions(id),
  kind varchar NOT NULL DEFAULT 'subscription_purchase',
  amount_bdt integer NOT NULL,
  status varchar NOT NULL DEFAULT 'open',
  payment_event_id uuid REFERENCES payment_events(id),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- B4: one open subscription_purchase bill per driver at a time (settle-first barrier at the DB layer).
CREATE UNIQUE INDEX driver_bills_one_open_uq ON driver_bills(driver_id)
  WHERE status = 'open' AND kind = 'subscription_purchase';
-- M-14: one payment event settles at most one bill.
CREATE UNIQUE INDEX driver_bills_payment_event_uq ON driver_bills(payment_event_id)
  WHERE payment_event_id IS NOT NULL;

-- S3: commission_enrollments — commission-mode possession, non-expiring (no expires_at).
CREATE TABLE IF NOT EXISTS commission_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  driver_id uuid NOT NULL REFERENCES drivers(id),
  package_id uuid NOT NULL REFERENCES packages(id),
  status varchar NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX commission_enrollments_one_active_uq ON commission_enrollments(driver_id)
  WHERE status = 'active';

-- S4: subscriptions.frozen_at (D2 frozen-calls state).
ALTER TABLE subscriptions ADD COLUMN frozen_at timestamptz;

-- S5: monetization_mode enum + rides.monetization_mode_snapshot (NULL = pre-cutover, D5).
CREATE TYPE monetization_mode AS ENUM ('subscription', 'commission');
ALTER TABLE rides ADD COLUMN monetization_mode_snapshot monetization_mode;
CREATE INDEX rides_commission_accrued_idx ON rides(driver_id)
  INCLUDE (platform_commission_bdt)
  WHERE status = 'completed' AND monetization_mode_snapshot = 'commission';

-- S6: driver_commission_settlements.kind, backfilled to 'commission' (F-4 purpose-filtered sums).
ALTER TABLE driver_commission_settlements ADD COLUMN kind varchar NOT NULL DEFAULT 'commission';
UPDATE driver_commission_settlements SET kind = 'commission' WHERE kind IS NULL;

-- S7: dispatch_offers.monetization_mode — durable ride-level mode binding (M-01), NULL on legacy rows.
ALTER TABLE dispatch_offers ADD COLUMN monetization_mode monetization_mode;

-- §3.3: driver_unpaid_obligations — the single owed-figure (total = unpaid subscription bills + net commission dues).
CREATE OR REPLACE VIEW driver_unpaid_obligations AS
WITH open_bills AS (
    SELECT driver_id, SUM(amount_bdt) AS unpaid_subscription_paisa
    FROM driver_bills
    WHERE status = 'open' AND kind = 'subscription_purchase'
    GROUP BY driver_id
),
commission_accrued AS (
    SELECT driver_id, SUM(platform_commission_bdt) AS accrued_paisa
    FROM rides
    WHERE status = 'completed'
      AND monetization_mode_snapshot = 'commission'
    GROUP BY driver_id
),
commission_settled AS (
    SELECT driver_id, SUM(amount_bdt) AS settled_paisa
    FROM driver_commission_settlements
    WHERE status = 'completed' AND kind = 'commission'
    GROUP BY driver_id
),
-- D1 backstop: an active subscription's own open bill cannot lock out that subscription while usable.
active_self_bill AS (
    SELECT b.driver_id, b.amount_bdt AS self_bill_paisa
    FROM driver_bills b
    JOIN subscriptions s ON s.id = b.subscription_id
    WHERE b.status = 'open' AND b.kind = 'subscription_purchase'
      AND s.status = 'active'
      AND s.frozen_at IS NULL
      AND s.expires_at > now()
      AND (s.calls_remaining > 0 OR s.calls_remaining = -1)
)
SELECT d.id AS driver_id,
       COALESCE(b.unpaid_subscription_paisa, 0) AS unpaid_subscription_paisa,
       GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0) AS net_commission_paisa,
       COALESCE(b.unpaid_subscription_paisa, 0)
         + GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0) AS total_unpaid_paisa,
       COALESCE(ab.self_bill_paisa, 0) AS active_self_bill_paisa,
       COALESCE(b.unpaid_subscription_paisa, 0)
         + GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0)
         - COALESCE(ab.self_bill_paisa, 0) AS lockout_exposure_paisa
FROM drivers d
LEFT JOIN open_bills b ON b.driver_id = d.id
LEFT JOIN commission_accrued ca ON ca.driver_id = d.id
LEFT JOIN commission_settled cs ON cs.driver_id = d.id
LEFT JOIN active_self_bill ab ON ab.driver_id = d.id;

ALTER TABLE driver_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_bills FORCE ROW LEVEL SECURITY;
REVOKE ALL ON driver_bills FROM anon, authenticated;

ALTER TABLE commission_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_enrollments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON commission_enrollments FROM anon, authenticated;

-- D1 floor invariant: ceiling must cover the most expensive live call package plus the ৳10 dust buffer.
DO $$
DECLARE
  max_price bigint;
  ceiling bigint;
BEGIN
  SELECT COALESCE(MAX(price_bdt), 0) INTO max_price
  FROM packages WHERE deleted_at IS NULL AND product_type = 'call_package';
  SELECT value::bigint INTO ceiling
  FROM platform_config WHERE key = 'max_commission_debt_bdt';
  IF ceiling IS NOT NULL AND ceiling < max_price + 1000 THEN
    RAISE EXCEPTION 'D1 floor violated: max_commission_debt_bdt (%) must be >= max live call-package price (%) + 1,000 paisa', ceiling, max_price;
  END IF;
END $$;
