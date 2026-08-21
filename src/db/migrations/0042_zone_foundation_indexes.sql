-- Z-1: Zone Foundation — index-only migration
-- Replaces the single-zone constraint with multi-zone support.
--
-- Rollback SQL (keep in migration header for safety):
--   DROP INDEX IF EXISTS zones_active_idx;
--   DROP INDEX IF EXISTS demand_forecasts_zone_hour_idx;
--   DROP INDEX IF EXISTS demand_forecasts_hour_idx;
--   DROP INDEX IF EXISTS rides_zone_created_idx;
--   CREATE UNIQUE INDEX zones_one_active ON zones USING btree ((1)) WHERE is_active = true;
--

-- 1. Drop the single-zone constraint
DROP INDEX IF EXISTS zones_one_active;

-- 2. Add plain active-zone index (permits multiple active zones)
CREATE INDEX IF NOT EXISTS zones_active_idx ON zones USING btree (is_active);

-- 3. Unique composite on demand_forecasts for upsert idempotency
CREATE UNIQUE INDEX IF NOT EXISTS demand_forecasts_zone_hour_idx
  ON demand_forecasts USING btree (zone_id, forecast_hour);

-- 4. Non-unique index on forecast_hour for time-range queries
CREATE INDEX IF NOT EXISTS demand_forecasts_hour_idx
  ON demand_forecasts USING btree (forecast_hour);

-- 5. Zone+time composite on rides for forecast aggregation and zone P&L
CREATE INDEX IF NOT EXISTS rides_zone_created_idx
  ON rides USING btree (zone_id, created_at);
