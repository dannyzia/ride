-- Migration 0007: Fare system v2
-- Drop old pricing columns, add new floor-based columns

-- 1. Remove deprecated columns from pricing
ALTER TABLE pricing
  DROP COLUMN IF EXISTS free_wait_minutes,
  DROP COLUMN IF EXISTS per_min_wait_bdt,
  DROP COLUMN IF EXISTS minimum_fare_bdt;

-- 2. Add new pricing columns
ALTER TABLE pricing
  ADD COLUMN IF NOT EXISTS per_min_bdt integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS floor_length_km numeric(10,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS floor_min integer NOT NULL DEFAULT 10;

-- 3. Add max_free_wait_seconds to system_config
INSERT INTO system_config (key, value, updated_at)
VALUES ('max_free_wait_seconds', '60', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 4. Note: preference_surcharge_bdt and preference_ids already added to rides
--    in migration 0006 (Feature 6). If not, add them here:
-- ALTER TABLE rides ADD COLUMN IF NOT EXISTS preference_surcharge_bdt integer NOT NULL DEFAULT 0;
-- ALTER TABLE rides ADD COLUMN IF NOT EXISTS preference_ids jsonb;
