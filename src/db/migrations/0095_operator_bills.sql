-- Migration: 0095_operator_bills.sql
-- Batch-2 Item 2: one ledger — driver_bills generalizes to operator_bills.
-- Rename discipline (additive-safe): the table, its id column, and its unique
-- indexes are renamed; the operator_role column is added with a backfill-free
-- 'driver' default; the §3.3 view is re-issued with IDENTICAL driver math,
-- references updated to operator_bills (Item 4 generalizes the view later —
-- not widened here). payment_events is untouched; revenue_model is untouched.

-- One ledger: the receivables table generalizes to every operator type.
ALTER TABLE driver_bills RENAME TO operator_bills;
ALTER TABLE operator_bills RENAME COLUMN driver_id TO operator_id;

-- The operator type this bill belongs to. Existing rows (all drivers) default
-- to 'driver' — byte-for-byte driver-path equivalence.
ALTER TABLE operator_bills
  ADD COLUMN operator_role operator_role NOT NULL DEFAULT 'driver';

-- Composite one-open barrier: one open subscription_purchase bill per
-- (operator_role, operator_id). An operator may hold independent open slots
-- per role (a driver-role slot and a shop-role slot do not 23505 each other).
DROP INDEX driver_bills_one_open_uq;
CREATE UNIQUE INDEX operator_bills_one_open_uq ON operator_bills(operator_role, operator_id)
  WHERE status = 'open' AND kind = 'subscription_purchase';

-- M-14 under the new table reference: one payment event settles at most one bill.
DROP INDEX driver_bills_payment_event_uq;
CREATE UNIQUE INDEX operator_bills_payment_event_uq ON operator_bills(payment_event_id)
  WHERE payment_event_id IS NOT NULL;

-- Naming hygiene: the plain lookup index follows the rename.
CREATE INDEX IF NOT EXISTS operator_bills_operator_idx ON operator_bills(operator_id);

-- §3.3 view re-issued: IDENTICAL driver math, references updated to
-- operator_bills. Driver rows carry operator_role='driver'; shop/delivery/
-- fleet rows are excluded so driver dues figures are unpolluted (Item 4
-- generalizes the view's math later — not widened here).
CREATE OR REPLACE VIEW driver_unpaid_obligations AS
WITH open_bills AS (
    SELECT operator_id AS driver_id, SUM(amount_bdt) AS unpaid_subscription_paisa
    FROM operator_bills
    WHERE status = 'open' AND kind = 'subscription_purchase'
      AND operator_role = 'driver'
    GROUP BY operator_id
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
    SELECT b.operator_id AS driver_id, b.amount_bdt AS self_bill_paisa
    FROM operator_bills b
    JOIN subscriptions s ON s.id = b.subscription_id
    WHERE b.status = 'open' AND b.kind = 'subscription_purchase'
      AND b.operator_role = 'driver'
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
