-- Migration: 0093_d3b_billing_sets.sql
-- Amendment D3-B-r2: bundle billing sets (delta against Stage 1–3b, commits 2d2afb1 → ea03f36).
-- All changes are additive: four nullable columns, no enum alteration, no payment_events change.
-- monetization_mode stays two-valued ('subscription' | 'commission'); no 'bundle'/'lead' values.

-- S8: packages.commission_percent — commission rate for bundle packages
-- (non-null when this plan carries a commission leg; null = pure call package).
-- (0, 100] when set; blank/0 = no commission leg.
ALTER TABLE packages ADD COLUMN commission_percent numeric(5, 2);

-- S9: commission_enrollments.expires_at — enrollment expiry.
-- NULL = non-expiring (the ৳0 commission package).
ALTER TABLE commission_enrollments ADD COLUMN expires_at timestamptz;

-- S10: rides.commission_percent_snapshot — commission rate snapped from the offer at accept.
-- Non-null on bundle/commission rides; null on pure subscription/legacy rides.
ALTER TABLE rides ADD COLUMN commission_percent_snapshot numeric(5, 2);

-- S10: dispatch_offers.commission_percent — commission rate for this offer (bundle leg).
-- Non-null on bundle/commission offers; null on pure subscription/legacy offers.
ALTER TABLE dispatch_offers ADD COLUMN commission_percent numeric(5, 2);
