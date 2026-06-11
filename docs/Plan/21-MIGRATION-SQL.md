# Migration SQL Reference — Ride

> **Database Note:** Migrations are run via `drizzle-kit migrate` the same way, just against a Supabase PostgreSQL connection string (from Supabase Dashboard → Settings → Database → URI). The database is standard PostgreSQL; Drizzle migrations work identically on Supabase as on any other PostgreSQL host.

> Last updated to reflect the v2 schema additions: `platform_config`, `pricing` floor fare columns (`floor_length_km`, `floor_min`),
> `dispatch_offers.filtered_reason`, and the canonical vehicle_type enum migration.
>
> **All migrations must be reviewed by a human before applying to production.**
> Run against a staging environment first, verify row counts, then apply.
>
> **Configurability note:** Seed values in M-01 (platform_config), M-04 (pricing), and
> package-related migrations are production defaults only. All values are admin-configurable
> at runtime: pricing via `POST /api/admin/pricing`, platform_config via `PATCH /api/admin/config`,
> system_config via admin config endpoint.

---

## Migration Order (run in this sequence)

| # | Migration | Depends on |
|---|-----------|-----------|
| M-01 | `platform_config` table + seed | — |
| M-02 | `dispatch_offers.filtered_reason` column | Base schema |
| M-03 | `pricing` schema: drop `minimum_fare_bdt`/`per_min_wait_bdt`, add `per_min_bdt`/`floor_length_km`/`floor_min` + backfill | Base schema |
| M-04 | Update pricing seed to production fare matrix | M-03 |
| M-05 | `drivers` new columns (`min_per_km_bdt`, `vehicle_registration_date`, `brta_certificate_url`) | Base schema |
| M-06 | Vehicle type enum rename (UPPERCASE → lowercase) | All above |
| M-07 | Indexes for `dispatch_offers.filtered_reason` | M-02 + M-06 |
| M-08 | Commission and waiting time columns | Base schema |
| M-09 | `system_config` waiting time seeds | Base schema |

---

## M-01 — Create `platform_config` table and seed

Safe to run on any database (CREATE IF NOT EXISTS + ON CONFLICT DO NOTHING).

```sql
-- M-01-platform-config.sql
BEGIN;

CREATE TABLE IF NOT EXISTS platform_config (
  key        varchar(100) PRIMARY KEY,
  value      text         NOT NULL,
  updated_at timestamptz  NOT NULL DEFAULT now()
);

-- Seed default values — safe to re-run
INSERT INTO platform_config (key, value, updated_at) VALUES
  ('driver_min_ratio',           '0.70',  now()),
  ('driver_max_ratio',           '1.50',  now()),
  ('brta_max_base_bdt',          '8500',  now()),
  ('brta_max_per_km_bdt',        '3400',  now()),
  ('brta_max_wait_per_2min_bdt', '850',   now())
ON CONFLICT (key) DO NOTHING;

COMMIT;
```

**Verify:**
```sql
SELECT key, value FROM platform_config ORDER BY key;
-- Should return 5 rows
```

---

## M-02 — Add `filtered_reason` to `dispatch_offers`

```sql
-- M-02-dispatch-offers-filtered-reason.sql
BEGIN;

ALTER TABLE dispatch_offers
  ADD COLUMN IF NOT EXISTS filtered_reason varchar(50);

-- Index for missed-requests stat query
CREATE INDEX IF NOT EXISTS dispatch_offers_filtered_idx
  ON dispatch_offers (driver_id, outcome, sent_at)
  WHERE outcome = 'filtered';

COMMIT;
```

**Verify:**
```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'dispatch_offers' AND column_name = 'filtered_reason';
-- Should return: filtered_reason | character varying | 50
```

---

## M-03 — Update `pricing` table to new fare schema

Drops the old `minimum_fare_bdt`, `per_min_wait_bdt`, and `free_wait_minutes` columns. Adds `per_min_bdt`, `floor_length_km`, and `floor_min`. Free waiting is now a platform-wide constant (60 seconds) stored in `system_config.max_free_wait_seconds` — no longer per-vehicle-type. Backfills production values for all 8 vehicle types.

> **WARNING:** If the pricing table already has data (production), review this migration carefully. The backfill sets new column values; the DROP commands are irreversible.

```sql
BEGIN;

-- Step 1: add new columns as nullable first
ALTER TABLE pricing
  ADD COLUMN IF NOT EXISTS per_min_bdt       integer,
  ADD COLUMN IF NOT EXISTS floor_length_km   numeric(10,2),
  ADD COLUMN IF NOT EXISTS floor_min         integer;

-- Step 2: backfill new columns from production fare matrix
--   All money in integer paisa. floor_length_km is decimal km.
UPDATE pricing SET
  per_min_bdt     = CASE vehicle_type::text
    WHEN 'bike_basic'    THEN  175
    WHEN 'bike_standard' THEN  180
    WHEN 'bike_plus'     THEN  190
    WHEN 'cng'           THEN  200
    WHEN 'car_economy'   THEN  350
    WHEN 'car_comfort'   THEN  375
    WHEN 'car_premium'   THEN  400
    WHEN 'car_xl'        THEN  425
    ELSE 175
  END,
  floor_length_km = CASE vehicle_type::text
    WHEN 'bike_basic'    THEN 2.00
    WHEN 'bike_standard' THEN 2.00
    WHEN 'bike_plus'     THEN 2.00
    WHEN 'cng'           THEN 3.00
    WHEN 'car_economy'   THEN 4.00
    WHEN 'car_comfort'   THEN 4.00
    WHEN 'car_premium'   THEN 4.00
    WHEN 'car_xl'        THEN 4.00
    ELSE 2.00
  END,
  floor_min = CASE vehicle_type::text
    WHEN 'bike_basic'    THEN 10
    WHEN 'bike_standard' THEN 10
    WHEN 'bike_plus'     THEN 10
    WHEN 'cng'           THEN 15
    WHEN 'car_economy'   THEN 20
    WHEN 'car_comfort'   THEN 20
    WHEN 'car_premium'   THEN 20
    WHEN 'car_xl'        THEN 20
    ELSE 10
  END;

-- Step 3: set NOT NULL now that all rows are backfilled
ALTER TABLE pricing
  ALTER COLUMN per_min_bdt     SET NOT NULL,
  ALTER COLUMN floor_length_km SET NOT NULL,
  ALTER COLUMN floor_min       SET NOT NULL;

-- Step 4: remove old columns (irreversible — ensure backups exist)
ALTER TABLE pricing
  DROP COLUMN IF EXISTS minimum_fare_bdt,
  DROP COLUMN IF EXISTS per_min_wait_bdt;

-- Step 5: drop free_wait_minutes (now a platform-wide constant in system_config)
ALTER TABLE pricing
  DROP COLUMN IF EXISTS free_wait_minutes;

COMMIT;
```

**Verification query:**
```sql
SELECT
  vehicle_type::text,
  base_fare_bdt,
  per_km_bdt,
  per_min_bdt,
  floor_length_km,
  floor_min,
  -- Computed floor in BDT (for visual check only)
  ROUND((base_fare_bdt + ROUND(per_km_bdt * floor_length_km) + (floor_min * per_min_bdt))::numeric / 100, 2) AS floor_bdt
FROM pricing
WHERE is_active = true
ORDER BY vehicle_type::text;
-- Expected floor_bdt: bike_basic=58, bike_standard=62, bike_plus=65, cng=115,
--   car_economy=175, car_comfort=197, car_premium=229, car_xl=265
```

---

## M-04 — Update pricing rows to production fare matrix

Updates all 8 vehicle type rows to the final production fare values. Run after M-03. Requires `ACTIVE_ZONE_ID` to be set.

> **Usage:** `psql $DATABASE_URL -v active_zone_id="'<uuid>'" -f this_file.sql`

```sql
BEGIN;

UPDATE pricing SET
  base_fare_bdt = 2500, per_km_bdt =  775, per_min_bdt = 175,
  floor_length_km = 2.00, floor_min = 10, updated_at = now()
WHERE vehicle_type::text = 'bike_basic' AND zone_id = :'active_zone_id' AND is_active = true;

UPDATE pricing SET
  base_fare_bdt = 2500, per_km_bdt =  950, per_min_bdt = 180,
  floor_length_km = 2.00, floor_min = 10, updated_at = now()
WHERE vehicle_type::text = 'bike_standard' AND zone_id = :'active_zone_id' AND is_active = true;

UPDATE pricing SET
  base_fare_bdt = 2500, per_km_bdt = 1050, per_min_bdt = 190,
  floor_length_km = 2.00, floor_min = 10, updated_at = now()
WHERE vehicle_type::text = 'bike_plus' AND zone_id = :'active_zone_id' AND is_active = true;

UPDATE pricing SET
  base_fare_bdt = 4000, per_km_bdt = 1500, per_min_bdt = 200,
  floor_length_km = 3.00, floor_min = 15, updated_at = now()
WHERE vehicle_type::text = 'cng' AND zone_id = :'active_zone_id' AND is_active = true;

UPDATE pricing SET
  base_fare_bdt = 4500, per_km_bdt = 1500, per_min_bdt = 350,
  floor_length_km = 4.00, floor_min = 20, updated_at = now()
WHERE vehicle_type::text = 'car_economy' AND zone_id = :'active_zone_id' AND is_active = true;

UPDATE pricing SET
  base_fare_bdt = 5000, per_km_bdt = 1800, per_min_bdt = 375,
  floor_length_km = 4.00, floor_min = 20, updated_at = now()
WHERE vehicle_type::text = 'car_comfort' AND zone_id = :'active_zone_id' AND is_active = true;

UPDATE pricing SET
  base_fare_bdt = 6500, per_km_bdt = 2100, per_min_bdt = 400,
  floor_length_km = 4.00, floor_min = 20, updated_at = now()
WHERE vehicle_type::text = 'car_premium' AND zone_id = :'active_zone_id' AND is_active = true;

UPDATE pricing SET
  base_fare_bdt = 8000, per_km_bdt = 2500, per_min_bdt = 425,
  floor_length_km = 4.00, floor_min = 20, updated_at = now()
WHERE vehicle_type::text = 'car_xl' AND zone_id = :'active_zone_id' AND is_active = true;

COMMIT;
```

---

## M-05 — Add new columns to `drivers`

```sql
-- M-05-drivers-new-columns.sql
BEGIN;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS min_per_km_bdt           integer,        -- NULL = no minimum set
  ADD COLUMN IF NOT EXISTS vehicle_registration_date date,           -- BRTA 1-year age check
  ADD COLUMN IF NOT EXISTS brta_certificate_url     text;           -- Storage URL for BRTA cert

COMMIT;
```

**Verify:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'drivers'
  AND column_name IN ('min_per_km_bdt', 'vehicle_registration_date', 'brta_certificate_url')
ORDER BY column_name;
-- Should return 3 rows, all nullable
```

---

## M-06 — Vehicle type enum: UPPERCASE → lowercase (5-step strategy)

> ⚠️ **This is the most dangerous migration. Never auto-apply. Review generated SQL manually.**
> The 5-step strategy avoids locking the entire table in one shot.

### Why 5 steps?
PostgreSQL does not allow `ALTER TYPE … RENAME VALUE` in older versions, and dropping an enum in
use causes errors. The safe approach is: create the new enum, add a shadow column, copy data, swap,
drop old.

```sql
-- M-06-vehicle-type-enum-lowercase.sql
-- Run each step separately. Verify between steps.

-- ── STEP 1: Create the new lowercase enum ────────────────────────────────────
BEGIN;
CREATE TYPE vehicle_type_v2 AS ENUM (
  'bike_basic',
  'bike_standard',
  'bike_plus',
  'cng',
  'car_economy',
  'car_comfort',
  'car_premium',
  'car_xl'
);
COMMIT;

-- ── STEP 2: Add shadow columns to all affected tables ────────────────────────
BEGIN;
ALTER TABLE drivers         ADD COLUMN vehicle_type_new vehicle_type_v2;
ALTER TABLE vehicles        ADD COLUMN vehicle_type_new vehicle_type_v2;
ALTER TABLE pricing         ADD COLUMN vehicle_type_new vehicle_type_v2;
ALTER TABLE rides           ADD COLUMN vehicle_type_new vehicle_type_v2;
ALTER TABLE vehicle_type_changes ADD COLUMN old_vehicle_type_new vehicle_type_v2;
ALTER TABLE vehicle_type_changes ADD COLUMN new_vehicle_type_new vehicle_type_v2;
COMMIT;

-- ── STEP 3: Copy with mapping ─────────────────────────────────────────────────
-- Helper function for mapping
BEGIN;
CREATE OR REPLACE FUNCTION _map_vehicle_type(v text) RETURNS vehicle_type_v2 AS $$
BEGIN
  RETURN CASE v
    WHEN 'BIKE_BASIC'    THEN 'bike_basic'
    WHEN 'BIKE_STANDARD' THEN 'bike_standard'
    WHEN 'BIKE_PLUS'     THEN 'bike_plus'
    WHEN 'CNG'           THEN 'cng'
    WHEN 'CAR_ECONOMY'   THEN 'car_economy'
    WHEN 'CAR_COMFORT'   THEN 'car_comfort'
    WHEN 'CAR_PREMIUM'   THEN 'car_premium'
    WHEN 'CAR_XL'        THEN 'car_xl'
    -- Already lowercase (if partially migrated):
    WHEN 'bike_basic'    THEN 'bike_basic'
    WHEN 'bike_standard' THEN 'bike_standard'
    WHEN 'bike_plus'     THEN 'bike_plus'
    WHEN 'cng'           THEN 'cng'
    WHEN 'car_economy'   THEN 'car_economy'
    WHEN 'car_comfort'   THEN 'car_comfort'
    WHEN 'car_premium'   THEN 'car_premium'
    WHEN 'car_xl'        THEN 'car_xl'
    ELSE NULL -- signals unmapped value — investigate before proceeding
  END;
END;
$$ LANGUAGE plpgsql;

UPDATE drivers          SET vehicle_type_new              = _map_vehicle_type(vehicle_type::text);
UPDATE vehicles         SET vehicle_type_new              = _map_vehicle_type(vehicle_type::text);
UPDATE pricing          SET vehicle_type_new              = _map_vehicle_type(vehicle_type::text);
UPDATE rides            SET vehicle_type_new              = _map_vehicle_type(vehicle_type::text);
UPDATE vehicle_type_changes SET old_vehicle_type_new      = _map_vehicle_type(old_vehicle_type::text);
UPDATE vehicle_type_changes SET new_vehicle_type_new      = _map_vehicle_type(new_vehicle_type::text);
COMMIT;

-- ── VERIFY BEFORE CONTINUING ──────────────────────────────────────────────────
-- These queries must return 0 rows. If not, investigate unmapped values FIRST.
SELECT id, vehicle_type FROM drivers         WHERE vehicle_type_new IS NULL;
SELECT id, vehicle_type FROM vehicles        WHERE vehicle_type_new IS NULL;
SELECT id, vehicle_type FROM pricing         WHERE vehicle_type_new IS NULL;
SELECT id, vehicle_type FROM rides           WHERE vehicle_type_new IS NULL;
SELECT id, old_vehicle_type FROM vehicle_type_changes WHERE old_vehicle_type_new IS NULL;
SELECT id, new_vehicle_type FROM vehicle_type_changes WHERE new_vehicle_type_new IS NULL;
-- ALL MUST RETURN 0 ROWS BEFORE PROCEEDING TO STEP 4.

-- ── STEP 4: Drop old columns, rename new columns ──────────────────────────────
BEGIN;
ALTER TABLE drivers
  DROP COLUMN vehicle_type,
  RENAME COLUMN vehicle_type_new TO vehicle_type;

ALTER TABLE vehicles
  DROP COLUMN vehicle_type,
  RENAME COLUMN vehicle_type_new TO vehicle_type;

ALTER TABLE pricing
  DROP COLUMN vehicle_type,
  RENAME COLUMN vehicle_type_new TO vehicle_type;

ALTER TABLE rides
  DROP COLUMN vehicle_type,
  RENAME COLUMN vehicle_type_new TO vehicle_type;

ALTER TABLE vehicle_type_changes
  DROP COLUMN old_vehicle_type,
  RENAME COLUMN old_vehicle_type_new TO old_vehicle_type;

ALTER TABLE vehicle_type_changes
  DROP COLUMN new_vehicle_type,
  RENAME COLUMN new_vehicle_type_new TO new_vehicle_type;
COMMIT;

-- ── STEP 5: Rename the type and clean up ──────────────────────────────────────
BEGIN;
-- Drop old enum (only safe after all columns have been migrated)
DROP TYPE IF EXISTS vehicle_type CASCADE;  -- CASCADE as a safety net
ALTER TYPE vehicle_type_v2 RENAME TO vehicle_type;
DROP FUNCTION IF EXISTS _map_vehicle_type(text);
COMMIT;
```

**Verify final state:**
```sql
SELECT typname, enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE typname = 'vehicle_type'
ORDER BY e.enumsortorder;
-- Should return 8 rows: bike_basic, bike_standard, bike_plus, cng,
--                        car_economy, car_comfort, car_premium, car_xl
```

---

## M-07 — Indexes for dispatch_offers filtered rows

```sql
-- M-07-dispatch-offers-indexes.sql
-- Run after M-02 and M-06.
BEGIN;

-- Existing partial index may need to be recreated if filtering on enum values changed
-- (recreate if it already exists to pick up the correct enum spelling)
DROP INDEX IF EXISTS dispatch_offers_filtered_idx;
CREATE INDEX dispatch_offers_filtered_idx
  ON dispatch_offers (driver_id, outcome, sent_at)
  WHERE outcome = 'filtered';

-- Missed-requests rolling 7-day query: driver + outcome + sent_at range
CREATE INDEX IF NOT EXISTS dispatch_offers_driver_outcome_sent_idx
  ON dispatch_offers (driver_id, sent_at)
  WHERE outcome IN ('filtered', 'expired', 'refunded');

COMMIT;
```

---

## M-08 — Commission and Waiting Time Columns

```sql
-- M-08-commission-waiting-time.sql
BEGIN;

-- pricing table
ALTER TABLE pricing
  ADD COLUMN platform_commission_percent numeric(5,2) NOT NULL DEFAULT 0.00;

-- rides table
ALTER TABLE rides
  ADD COLUMN arrived_at timestamptz NULL,
  ADD COLUMN platform_commission_bdt integer NULL;

-- ride_status enum (must run before any DML on the column)
ALTER TYPE ride_status ADD VALUE 'driver_arrived' AFTER 'driver_arriving';

COMMIT;
```

---

## M-09 — Waiting Time Config Seeds

```sql
-- M-09-waiting-time-seeds.sql
BEGIN;

INSERT INTO system_config (key, value) VALUES
  ('geofence_arrival_radius_meters', '100'),
  ('geofence_arrival_dwell_seconds', '30'),
  ('stale_arrived_timeout_minutes',  '15'),
  ('max_free_wait_seconds',          '60')   -- platform-wide free wait; auto-start timer + timer_start computation
ON CONFLICT (key) DO NOTHING;

COMMIT;
```

---

## Post-migration checklist

After running all migrations on **staging**, verify:

1. `SELECT COUNT(*) FROM platform_config;` → 5 rows
2. `SELECT vehicle_type::text, per_min_bdt, floor_length_km, floor_min FROM pricing WHERE is_active=true ORDER BY 1;` → 8 rows, correct values (see M-03 verification query for expected floor_bdt values)
3. `SELECT column_name FROM information_schema.columns WHERE table_name='drivers' AND column_name IN ('min_per_km_bdt','vehicle_registration_date');` → 2 rows
4. `SELECT column_name FROM information_schema.columns WHERE table_name='dispatch_offers' AND column_name='filtered_reason';` → 1 row
5. Vehicle type enum check (M-06 verify query above) → 8 lowercase values
6. Run `scripts/seed-pricing.js` with `ACTIVE_ZONE_ID=<staging_zone_id>` and confirm 8 rows updated
7. Run `scripts/seed-platform-config.js` and confirm 5 rows `DO NOTHING` (already seeded)
8. Start the application and call `GET /api/reference/vehicle-types` → 8 vehicle types returned with lowercase keys
9. Call `GET /api/admin/config` → 5 platform_config rows
10. Attempt `PATCH /api/driver/me` with `{ min_per_km_bdt: 999 }` for a bike_basic driver → 400 with bounds info

After verifying on staging, apply to production during a low-traffic window.
