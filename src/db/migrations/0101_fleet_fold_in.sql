-- Migration: 0101_fleet_fold_in.sql
-- Batch-2 Item 10: fold the fleet subscription rail into the unified package model.
--
-- Owner disposition (EGM 2026-11-07 §2): "fleet's existing subscription tables
-- fold into the unified package model (migration/cleanup), not a parallel
-- system." This migration converts the DATA; the PURCHASE rail switches in code
-- (the legacy POST /api/fleet/plans writer is retired, /api/fleet/packages/*
-- is the fleet's purchase surface).
--
-- WHAT IS FOLDED
--   1. LIVE fleet_subscription_plans  → packages rows, with the PLAN'S PRIMARY
--      KEY PRESERVED as the packages.id. That is what makes the possession rows
--      below mappable without a join table: a subscription's plan_id is already
--      a package id after this migration.
--   2. ACTIVE fleet_subscriptions     → operator_packages rows
--      (operator_role='fleet', operator_id = fleets.id, package_id = the folded
--      plan id, expires_at = the subscription's current_period_end).
--
-- WHAT IS NOT FOLDED (deliberately)
--   - fleet_billing_transactions: RETAINED as history, no row migration. Fleet
--     money that was already collected/billed stays a fact about the fleet, not
--     about a package.
--   - Neither legacy table is dropped here. They keep history and the read-only
--     consumers that still point at them (capacity limits + the fleet panel's
--     subscription screen until Item 13). A later cleanup migration may drop
--     them; doing it now would delete the only copy of the fleet capacity
--     profile (vehicle_limit / driver_limit / api_limit / features), which the
--     packages table does not model.
--   - fleets.subscription_plan_id / fleets.subscription_status are left in
--     place: they are the legacy denormalized pointer and, because the plan id
--     survives as a package id, they keep resolving.
--
-- NAMING NOTE (documented in the brief, repeated here so the row is not
-- misread): folded fleet plans carry product_type='call_package'. That label is
-- legacy naming — a fleet package sells CAPACITY + MARKETPLACE ENTITLEMENT, not
-- leads. The operative facts are applicable_roles='{fleet}' and call_count=0
-- (no lead leg is ever granted to a fleet). commission_percent stays NULL: in
-- v1 no fleet billing event consumes it, and a non-zero value on a fleet
-- package is rejected at purchase time (fleet_commission_unsupported) rather
-- than being silently inert.
--
-- DURATION: fleet plans carry a billing_period enum, packages carry
-- duration_days. The mapping is the nominal period length the fleet renewal
-- used: WEEKLY → 7, MONTHLY → 30, YEARLY → 365.

-- ── 1) plan → package (id preserved) ────────────────────────────────────────
--
-- Name collisions: packages.name is UNIQUE among LIVE rows
-- (packages_name_live_uq), while fleet plan names had their own unique index —
-- the two catalogs were free to pick the same display name. Three tiers, each
-- checked against live packages only (soft-deleted names are not reserved):
--   the plan name, then "<name> (fleet)", then "<name> (fleet <id8>)".
-- Truncation keeps the result inside varchar(100).
INSERT INTO packages (
  id,
  name,
  code,
  call_count,
  duration_days,
  price_bdt,
  commission_percent,
  is_trial,
  is_active,
  daily_cap,
  vehicle_type,
  product_type,
  applicable_roles
)
SELECT
  p.id,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM packages x WHERE x.deleted_at IS NULL AND x.name = p.name
    ) THEN p.name
    WHEN NOT EXISTS (
      SELECT 1 FROM packages x
      WHERE x.deleted_at IS NULL AND x.name = left(p.name, 88) || ' (fleet)'
    ) THEN left(p.name, 88) || ' (fleet)'
    ELSE left(p.name, 80) || ' (fleet ' || left(p.id::text, 8) || ')'
  END,
  NULL,                     -- no machine code: fleet plans never had one
  0,                        -- no lead leg (see header)
  CASE p.billing_period
    WHEN 'WEEKLY'  THEN 7
    WHEN 'MONTHLY' THEN 30
    WHEN 'YEARLY'  THEN 365
  END,
  p.price_bdt,              -- integer paisa, unchanged
  NULL,                     -- commission leg unsupported for fleets in v1
  false,
  p.active,
  200,                      -- column default; inert (no leads are granted)
  NULL,                     -- universal vehicle scope
  'call_package',           -- legacy label (see header)
  '{fleet}'::text[]
FROM fleet_subscription_plans p
WHERE p.active
  AND NOT EXISTS (SELECT 1 FROM packages x WHERE x.id = p.id);

-- ── 2) ACTIVE subscription → possession (operator_packages) ────────────────
--
-- expiries: current_period_end. NULL stays NULL (the gate reads NULL as
-- non-expiring, exactly as the legacy ACTIVE-subscription predicate did).
-- One row per fleet (DISTINCT ON, newest subscription wins) because
-- operator_packages_one_active_uq allows exactly one ACTIVE possession per
-- (role, operator). A fleet that already holds an ACTIVE possession — bought on
-- the Item 6 rail during the interim — is skipped, so this migration can never
-- 23505 on that index.
INSERT INTO operator_packages (
  operator_role,
  operator_id,
  package_id,
  status,
  started_at,
  expires_at
)
SELECT DISTINCT ON (s.fleet_id)
  'fleet'::operator_role,
  s.fleet_id,
  s.plan_id,
  'active',
  COALESCE(s.started_at, s.created_at),
  s.current_period_end
FROM fleet_subscriptions s
WHERE s.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM packages x WHERE x.id = s.plan_id)
  AND NOT EXISTS (
    SELECT 1 FROM operator_packages op
    WHERE op.operator_role = 'fleet'
      AND op.operator_id = s.fleet_id
      AND op.status = 'active'
  )
ORDER BY s.fleet_id, s.created_at DESC;

-- ── 3) kept on purpose ─────────────────────────────────────────────────────
-- No DROP of fleet_subscription_plans / fleet_subscriptions /
-- fleet_billing_transactions. Withdrawing those writers is a code change
-- (Item 10 §2/§3), not a schema change.
