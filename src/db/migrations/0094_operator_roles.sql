-- Migration: 0094_operator_roles.sql
-- Batch-2 Item 1: operator role registry + package applicability.
-- Additive: one new enum, one column with a backfill-free default, one CHECK.
-- revenue_model is untouched; existing rows keep today's exact behavior
-- (every plan defaults to the driver base).

-- Operator role registry — the operator TYPE a plan applies to.
-- Restaurants are shops (no separate role). No 'lead'/'bundle' style extras.
CREATE TYPE operator_role AS ENUM ('driver', 'shop', 'delivery', 'fleet');

-- Operator applicability on packages: which operator type(s) the plan applies
-- to. Every existing row defaults to the driver base.
ALTER TABLE packages ADD COLUMN applicable_roles text[] NOT NULL DEFAULT '{driver}';

-- Non-empty: an empty array would make the plan invisible to every operator.
ALTER TABLE packages ADD CONSTRAINT packages_applicable_roles_nonempty CHECK (cardinality(applicable_roles) >= 1);
