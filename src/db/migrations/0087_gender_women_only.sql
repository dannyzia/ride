-- 1. Create gender enum safely (DO block catches duplicate_object on replay)
DO $$ BEGIN
  CREATE TYPE "gender" AS ENUM ('male', 'female', 'other', 'unspecified');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- 2. Add gender to users with default 'unspecified'
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender "gender" NOT NULL DEFAULT 'unspecified';
--> statement-breakpoint
-- 3. Retype drivers.gender only while it is varchar (idempotent on replay)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'gender' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE drivers ALTER COLUMN gender TYPE "gender"
      USING (CASE WHEN LOWER(gender) IN ('male','female','other','unspecified')
                  THEN LOWER(gender)::"gender" ELSE 'unspecified'::"gender" END);
  END IF;
END $$;
--> statement-breakpoint
-- 4. Enforce NOT NULL and DEFAULT on drivers.gender
ALTER TABLE drivers ALTER COLUMN gender SET NOT NULL;
--> statement-breakpoint
ALTER TABLE drivers ALTER COLUMN gender SET DEFAULT 'unspecified';
--> statement-breakpoint
-- 5. Add gender_verified and women_only_enabled to drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS gender_verified boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS women_only_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- 6. Add women_only and secondary_rider_female to rides
ALTER TABLE rides ADD COLUMN IF NOT EXISTS women_only boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE rides ADD COLUMN IF NOT EXISTS secondary_rider_female boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- 7. BEFORE UPDATE trigger: strictly enforce invariant by resetting verification on any gender change
CREATE OR REPLACE FUNCTION trg_drivers_gender_reset_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.gender IS DISTINCT FROM OLD.gender THEN
    -- Unconditionally reset verification and toggle on ANY gender change.
    -- No code path can self-verify by setting gender and gender_verified in a single UPDATE.
    NEW.gender_verified := false;
    NEW.women_only_enabled := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_drivers_gender_reset ON drivers;
--> statement-breakpoint
CREATE TRIGGER trg_drivers_gender_reset
BEFORE UPDATE OF gender ON drivers
FOR EACH ROW
EXECUTE FUNCTION trg_drivers_gender_reset_fn();
--> statement-breakpoint
-- 7b. BEFORE INSERT trigger: prevent any INSERT from arriving with gender_verified=true
-- or women_only_enabled=true. The column defaults are false, but a code path that
-- explicitly passes true on INSERT bypasses the UPDATE trigger (R11-C2).
CREATE OR REPLACE FUNCTION trg_drivers_insert_reset_fn()
RETURNS TRIGGER AS $$
BEGIN
  NEW.gender_verified := false;
  NEW.women_only_enabled := false;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_drivers_insert_reset ON drivers;
--> statement-breakpoint
CREATE TRIGGER trg_drivers_insert_reset
BEFORE INSERT ON drivers
FOR EACH ROW
EXECUTE FUNCTION trg_drivers_insert_reset_fn();
--> statement-breakpoint
-- 8. Seed platform_config keys (seeds-not-constants compliant; seeded disabled)
INSERT INTO platform_config (key, value, updated_at) VALUES
  ('women_only_rides_enabled', 'false', now()),
  ('scooter_vehicle_type_enabled', 'false', now())
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- 9. Seed scooter pricing in every live zone by cloning bike_basic rows
INSERT INTO pricing (
  zone_id, vehicle_type, base_fare_bdt, per_km_bdt, intercity_per_km_bdt,
  per_min_bdt, floor_length_km, floor_min, platform_commission_percent, is_active,
  free_wait_minutes, wait_fee_per_minute_bdt, brta_fare_ceiling_bdt, base_km,
  initiation_minutes
)
SELECT
  zone_id, 'scooter', base_fare_bdt, per_km_bdt, intercity_per_km_bdt,
  per_min_bdt, floor_length_km, floor_min, platform_commission_percent, is_active,
  free_wait_minutes, wait_fee_per_minute_bdt, brta_fare_ceiling_bdt, base_km,
  initiation_minutes
FROM pricing p
WHERE vehicle_type = 'bike_basic' AND is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM pricing p2
    WHERE p2.zone_id = p.zone_id AND p2.vehicle_type = 'scooter'
  );
