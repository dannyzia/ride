-- Migration: 0096_operator_packages.sql
-- Batch-2 Item 3: operator possession table + grant lib (shop, delivery, fleet —
-- drivers keep subscriptions/enrollments; those are untouched).
-- Additive: one new table + partial unique index. RLS/REVOKE posture mirrors 0092.
-- No enum alteration; payment_events untouched.

-- Non-driver operator possession: one ACTIVE package per (operator_role,
-- operator_id). status is 'active' | 'ended'. expires_at follows the package's
-- duration_days (Amendment D3-A: NULL/-1 → NULL unlimited, >= 1 → expiring).
CREATE TABLE operator_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  operator_role operator_role NOT NULL,
  operator_id uuid NOT NULL,
  package_id uuid NOT NULL REFERENCES packages(id),
  status varchar NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE package per (operator_role, operator_id).
CREATE UNIQUE INDEX operator_packages_one_active_uq ON operator_packages(operator_role, operator_id)
  WHERE status = 'active';

ALTER TABLE operator_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_packages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON operator_packages FROM anon, authenticated;
