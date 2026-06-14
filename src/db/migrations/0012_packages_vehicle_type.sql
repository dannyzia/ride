-- Migration: Add vehicle_type column to packages table.
-- Allows packages to be scoped to a specific vehicle type.
-- NULL = universal (available to all vehicle types).
-- A specific value = only available to that vehicle type.
-- Follows the same pattern as incentiveDefinitions.vehicle_type_filter.
--
-- Safe to re-run: uses IF NOT EXISTS / DO block.

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "vehicle_type" "vehicle_type";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'packages_vehicle_type_idx') THEN
    CREATE INDEX "packages_vehicle_type_idx" ON "packages" ("vehicle_type");
  END IF;
END
$$;
