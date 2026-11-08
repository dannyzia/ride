-- Migration: 0097_operator_unpaid_obligations.sql
-- Batch-2 Item 4: unified owed-figure view + dues lib generalization.
-- operator_unpaid_obligations: the generalized owed-figure keyed
-- (operator_role, operator_id). driver_unpaid_obligations becomes a thin
-- wrapper (operator_role='driver') so every existing driver consumer keeps
-- working unchanged. Views hold no data: DROP + CREATE is metadata-only.
--
-- PINNED DEFERRAL (owner-flagged, Batch-2 v1): non-driver ceiling-lockout
-- enforcement at USAGE time is deferred — the ceiling gates PURCHASE for all
-- operators (settle-first, Batch-2 Item 1), while non-driver usage continues
-- over-ceiling until each vertical adds its own enforcement point. The
-- lockout_exposure_paisa column still REPORTS the exposure for non-driver
-- rows; enforcement wiring is per-vertical future work.

-- The generalized owed-figure: one row per operator that exists as a driver
-- or holds at least one open bill.
CREATE OR REPLACE VIEW operator_unpaid_obligations AS
WITH open_sub AS (
    -- Open subscription bills: ALL operator roles.
    SELECT operator_role, operator_id, SUM(amount_bdt) AS unpaid_subscription_paisa
    FROM operator_bills
    WHERE status = 'open' AND kind = 'subscription_purchase'
    GROUP BY operator_role, operator_id
),
open_usage AS (
    -- Open usage/commission bills (non-driver verticals, Items 8-10):
    -- counted as net_commission_paisa for non-driver rows. Driver rows have
    -- none today (forward-compatible).
    SELECT operator_role, operator_id, SUM(amount_bdt) AS open_usage_paisa
    FROM operator_bills
    WHERE status = 'open' AND kind <> 'subscription_purchase'
      AND operator_role <> 'driver'
    GROUP BY operator_role, operator_id
),
commission_accrued AS (
    -- Driver commission legs: the existing rides math (snapshot-gated).
    -- Applied ONLY to operator_role='driver' rows — not widened.
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
active_self_bill_driver AS (
    -- Driver carve-out (existing rule, preserved exactly): open bill whose
    -- subscription is usable (D1 backstop — the sub's own bill cannot lock
    -- out that subscription while usable).
    SELECT b.operator_id AS driver_id, b.amount_bdt AS self_bill_paisa
    FROM operator_bills b
    JOIN subscriptions s ON s.id = b.subscription_id
    WHERE b.status = 'open' AND b.kind = 'subscription_purchase'
      AND b.operator_role = 'driver'
      AND s.status = 'active'
      AND s.frozen_at IS NULL
      AND s.expires_at > now()
      AND (s.calls_remaining > 0 OR s.calls_remaining = -1)
),
active_self_bill_operator AS (
    -- Non-driver carve-out: open bill whose operator_packages possession is
    -- active (status='active' AND (expires_at IS NULL OR expires_at > now())).
    SELECT b.operator_role, b.operator_id, SUM(b.amount_bdt) AS self_bill_paisa
    FROM operator_bills b
    JOIN operator_packages op ON op.operator_role = b.operator_role
       AND op.operator_id = b.operator_id
      AND op.status = 'active'
      AND (op.expires_at IS NULL OR op.expires_at > now())
    WHERE b.status = 'open'
      AND b.operator_role <> 'driver'
    GROUP BY b.operator_role, b.operator_id
),
operator_rows AS (
    -- Row universe: every driver, plus every non-driver operator that holds
    -- at least one open bill.
    SELECT 'driver' AS operator_role, id AS operator_id FROM drivers
    UNION
    SELECT operator_role, operator_id FROM operator_bills
    WHERE operator_role <> 'driver'
    GROUP BY operator_role, operator_id
)
SELECT r.operator_role,
       r.operator_id,
       COALESCE(os.unpaid_subscription_paisa, 0) AS unpaid_subscription_paisa,
       CASE WHEN r.operator_role = 'driver'
         THEN GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0)
         ELSE COALESCE(ou.open_usage_paisa, 0)
       END AS net_commission_paisa,
       COALESCE(os.unpaid_subscription_paisa, 0)
         + CASE WHEN r.operator_role = 'driver'
           THEN GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0)
           ELSE COALESCE(ou.open_usage_paisa, 0)
       END AS total_unpaid_paisa,
       CASE WHEN r.operator_role = 'driver'
         THEN COALESCE(abd.self_bill_paisa, 0)
         ELSE COALESCE(abo.self_bill_paisa, 0)
       END AS active_self_bill_paisa,
       (COALESCE(os.unpaid_subscription_paisa, 0)
         + CASE WHEN r.operator_role = 'driver'
           THEN GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0)
           ELSE COALESCE(ou.open_usage_paisa, 0)
       END)
       - CASE WHEN r.operator_role = 'driver'
         THEN COALESCE(abd.self_bill_paisa, 0)
         ELSE COALESCE(abo.self_bill_paisa, 0)
       END AS lockout_exposure_paisa
FROM operator_rows r
LEFT JOIN open_sub os ON os.operator_role = r.operator_role AND os.operator_id = r.operator_id
LEFT JOIN open_usage ou ON ou.operator_role = r.operator_role AND ou.operator_id = r.operator_id
LEFT JOIN commission_accrued ca ON ca.driver_id = r.operator_id
LEFT JOIN commission_settled cs ON cs.driver_id = r.operator_id
LEFT JOIN active_self_bill_driver abd ON abd.driver_id = r.operator_id
LEFT JOIN active_self_bill_operator abo ON abo.operator_role = r.operator_role AND abo.operator_id = r.operator_id;

-- Thin wrapper: identical column list to the pre-Item-4 view (operator_id
-- re-aliased as driver_id + the five figures) — every existing driver consumer
-- (lib/commissionDues raw SQL, dispatch, dues routes) keeps working unchanged.
DROP VIEW driver_unpaid_obligations;
CREATE VIEW driver_unpaid_obligations AS
SELECT operator_id AS driver_id,
       unpaid_subscription_paisa,
       net_commission_paisa,
       total_unpaid_paisa,
       active_self_bill_paisa,
       lockout_exposure_paisa
FROM operator_unpaid_obligations
WHERE operator_role = 'driver';
