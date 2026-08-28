# Admin Monitoring Screens — SQL Query Definitions

**Created:** 2026-08-25
**Purpose:** Canonical reference for the database queries backing the 4 fare-framework admin screens. Each section documents the screen, its backing API route, the SQL it executes, and the cohort/monitoring logic.

---

## Table of Contents

1. [Heat Monitor](#1-heat-monitor) — `app/admin/heat-monitor.tsx`
2. [Pickup Analytics](#2-pickup-analytics) — `app/admin/pickup-analytics.tsx`
3. [Trust & Safety](#3-trust--safety) — `app/admin/trust-safety.tsx`
4. [Fare Config](#4-fare-config) — `app/admin/fare-config.tsx`

---

## 1. Heat Monitor

**Screen:** `app/admin/heat-monitor.tsx`
**API:** `GET /api/admin/heat-monitor` → `app/api/admin/heat-monitor+api.ts`
**Auth:** `requireRole('admin')`
**Auto-refresh:** 60 seconds (client-side interval)

### Purpose

Live zone heat score dashboard. Shows EWMA-blended heat scores per zone, the relative-density (suggest_score), and the Stage 0 exit-gate backtest correlation coefficient.

### Query 1: Zone Heat Scores

```sql
SELECT
  zh.zone_id,
  z.name AS zone_name,
  z.is_active AS zone_is_active,
  zh.score,
  zh.tag,
  zh.baseline_pct,
  zh.live_pctile,
  zh.live_ewma,
  zh.idle_driver_count,
  zh.computed_at,
  zh.updated_at
FROM zone_heat zh
INNER JOIN zones z ON zh.zone_id = z.id
ORDER BY z.name;
```

**Suggest score** (computed in application code, not SQL):
```
suggest_score = score / (1 + idle_driver_count)
```

**Tables:** `zone_heat` (PK: `zone_id` → `zones.id`), `zones`
**Indexes used:** `zone_heat_tag_idx` (on `tag`)
**Update frequency:** Live heatmap job runs every 60s; baseline job every 15min; weekly backtest job.

### Query 2: Backtest Correlation

```sql
SELECT value
FROM platform_config
WHERE key = 'heat_backtest_correlation'
LIMIT 1;
```

**Purpose:** Stage 0 exit-gate. A meaningfully positive correlation is required before enabling rider-facing pickup fees (Stage 1). Value is a string-encoded float (e.g., `"0.72"`). Updated by weekly backtest scheduler job.

**Table:** `platform_config` (key-value store, never cached)

### Columns Displayed

| Column | Source | Description |
|--------|--------|-------------|
| Zone | `zones.name` | Zone display name |
| Tag | `zone_heat.tag` | `hot` / `neutral` / `cold` |
| Score | `zone_heat.score` | Blended score (0–1), 40% baseline + 60% live |
| Baseline | `zone_heat.baseline_pct` | Percentile rank of trailing baseline (0–100) |
| Live | `zone_heat.live_pctile` | Percentile rank of live EWMA (0–100) |
| EWMA | `zone_heat.live_ewma` | Raw EWMA demand value |
| Idle | `zone_heat.idle_driver_count` | Online drivers with 0 active rides in this zone |
| Suggest | computed | `score / (1 + idle_drivers)` — relative-density Lever 0 |

---

## 2. Pickup Analytics

**Screen:** `app/admin/pickup-analytics.tsx`
**API:** `GET /api/admin/pickup-analytics?from=&to=&category=` → `app/api/admin/pickup-analytics+api.ts`
**Auth:** `requireRole('admin')`
**Default lookback:** 30 days (configurable via query param)

### Purpose

Stage 0 calibration dashboard. Shows percentile distributions of realized pickup distances per category × zone, enabling admins to calibrate free-radius and rate-multiplier settings. Target: 25–30% charge incidence.

### Query 1: Per-Category × Zone Distributions

```sql
SELECT
  pds.category,
  pds.zone_id,
  z.name AS zone_name,
  count(*)::int AS sample_count,
  count(*) FILTER (WHERE pds.charged = true)::int AS charged_count,
  round(count(*) FILTER (WHERE pds.charged = true) * 100.0
        / nullif(count(*), 0), 2) AS charge_pct,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY pds.realized_km) AS p50_realized,
  percentile_cont(0.70) WITHIN GROUP (ORDER BY pds.realized_km) AS p70_realized,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY pds.realized_km) AS p75_realized,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY pds.realized_km) AS p90_realized,
  round(avg(pds.quote_km)::numeric, 3) AS mean_quote_km,
  round(avg(pds.realized_km)::numeric, 3) AS mean_realized_km,
  round(avg(
    CASE WHEN pds.quote_km > 0
    THEN abs(pds.realized_km - pds.quote_km) / pds.quote_km * 100
    ELSE NULL END
  )::numeric, 2) AS mean_deviation_pct
FROM pickup_distance_samples pds
LEFT JOIN zones z ON pds.zone_id = z.id
WHERE [optional: pds.created_at >= $from]
  AND [optional: pds.created_at <= $to]
  AND [optional: pds.category = $category]
GROUP BY pds.category, pds.zone_id, z.name
ORDER BY pds.category, z.name;
```

**Filter parameters:**
- `from` — ISO date string, lower bound on `pickup_distance_samples.created_at`
- `to` — ISO date string, upper bound on `pickup_distance_samples.created_at`
- `category` — `bike`, `cng`, or `car` (matches the `PICKUP_CATEGORY` mapping from `vehicleTypes.ts`)

### Query 2: Overall Summary

```sql
SELECT
  count(*)::int AS total_samples,
  count(*) FILTER (WHERE pds.charged = true)::int AS total_charged,
  round(count(*) FILTER (WHERE pds.charged = true) * 100.0
        / nullif(count(*), 0), 2) AS overall_charge_pct,
  round(avg(
    CASE WHEN pds.quote_km > 0
    THEN abs(pds.realized_km - pds.quote_km) / pds.quote_km * 100
    ELSE NULL END
  )::numeric, 2) AS overall_mean_deviation
FROM pickup_distance_samples pds
WHERE [same optional filters as Query 1];
```

**Table:** `pickup_distance_samples` (append-only, no `updated_at`)
**Index used:** `pds_category_zone_time_idx` on `(category, zone_id, created_at)`

### Columns Displayed

| Column | Source | Description |
|--------|--------|-------------|
| Category | `pickup_distance_samples.category` | `bike`, `cng`, `car` |
| Zone | `zones.name` | Zone display name |
| p50/p70/p75/p90 | `percentile_cont()` | Realized pickup distance percentiles (km) |
| Charge % | computed | `charged_count / sample_count * 100` — target 25–30% |
| Dev Low/High | computed | Mean absolute % deviation of quote vs realized |
| N | `count(*)` | Sample count |
| Cap % | — | (Display field — percentage of samples where cap was binding) |
| Backstop % | — | (Display field — percentage where backstop % of fare was binding) |

### Monitoring Cohort

- **Population:** All completed rides where `pickup_distance_samples` has a row (harvested by scheduler when `pickup_measurement_enabled = true`)
- **Segmentation:** By `category` (bike/cng/car) × `zone_id`
- **Calibration signals:**
  - **Charge incidence < 20%**: Free radius too large → reduce `pickup_free_radius_km_{category}`
  - **Charge incidence > 35%**: Free radius too small → increase `pickup_free_radius_km_{category}`
  - **High deviation (>30%)**: Quote accuracy poor → investigate Barikoi routing for that zone

---

## 3. Trust & Safety

**Screen:** `app/admin/trust-safety.tsx`
**API:** `GET /api/admin/fraud-flags?flag_type=&status=&limit=&offset=` → `app/api/admin/fraud-flags+api.ts`
**Auth:** `requireRole('admin')`
**SLA:** 5 business days per fraud flag

### Purpose

Fraud flag management dashboard. Surfaces dawdle, off-platform completion, cancel rate, and heat manipulation flags with offense ladders. Also shows the zone recalibration queue.

### Query 1: Fraud Flags

```sql
SELECT
  ff.id,
  ff.driver_id,
  ff.flag_type,
  ff.ride_id,
  ff.evidence,
  ff.status,
  ff.offense_count,
  ff.resolved_by,
  ff.resolved_at,
  ff.created_at,
  ff.updated_at,
  u.name AS driver_name,
  u.phone AS driver_phone,
  d.vehicle_type AS driver_vehicle_type
FROM fraud_flags ff
INNER JOIN drivers d ON ff.driver_id = d.id
INNER JOIN users u ON d.user_id = u.id
WHERE [optional: ff.flag_type = $flag_type]
  AND [optional: ff.status = $status]
ORDER BY ff.created_at DESC
LIMIT $limit OFFSET $offset;
```

**Filter parameters:**
- `flag_type` — `dawdle`, `off_platform_completion`, `cancel_rate`, `heat_manipulation`
- `status` — `open`, `warned`, `escalated`, `blocked`, `resolved`
- `limit` — 1–200, default 50
- `offset` — non-negative integer

### Query 2: Total Count

```sql
SELECT count(*) AS total
FROM fraud_flags ff
WHERE [optional: ff.flag_type = $flag_type]
  AND [optional: ff.status = $status];
```

### Query 3: Resolve Flag (PATCH)

```sql
UPDATE fraud_flags
SET status = 'resolved',
    resolved_at = now(),
    resolved_by = $admin_user_id,
    updated_at = now()
WHERE id = $flag_id;
```

**Tables:**
- `fraud_flags` — PK: `id`, index on `(driver_id, flag_type, status)`
- `drivers` — joined via `fraud_flags.driver_id`
- `users` — joined via `drivers.user_id`

### Flag Types & Ladder

| Flag Type | Description | Escalation Ladder |
|-----------|-------------|-------------------|
| `dawdle` | Driver arriving but not moving toward pickup (GPS stagnation) | open → warned → escalated → blocked |
| `off_platform_completion` | Ride completed outside app tracking (trace mismatch) | open → escalated → blocked |
| `cancel_rate` | Driver cancel rate exceeds threshold (rolling 7d) | open → warned → escalated |
| `heat_manipulation` | Suspected fake requests or account sharing to inflate zone heat | open → escalated → blocked |

### Zone Recalibration Queue

The Trust & Safety screen also displays `zone_recalibration_queue` rows. This data is fetched from the same API response (schema-level join not shown in current API — may be a separate endpoint or added to the response). The queue surfaces zones where quoted-vs-actual deviation exceeds the threshold.

**Table:** `zone_recalibration_queue`
- PK: `id`
- Index: `(status, created_at)`
- Statuses: `open`, `reviewed`
- SLA: 5 business days from `created_at`

### Monitoring Cohort

- **Population:** All drivers with at least 1 `fraud_flags` row
- **Segmentation:** By `flag_type` × `status`
- **Alerting signals:**
  - Any `escalated` or `blocked` flag > 3 days old → operational review
  - `heat_manipulation` flags → investigate zone heat accuracy
  - Zone recalibration queue items > 5 days old → SLA breach

---

## 4. Fare Config

**Screen:** `app/admin/fare-config.tsx`
**API:** `GET /api/admin/config` + `PATCH /api/admin/config` → `app/api/admin/config+api.ts`
**Auth:** `requireRole('admin')`

### Purpose

Configuration dashboard for all fare framework `platform_config` keys. Allows admins to tune pickup fee parameters, heat engine thresholds, and true-up settings. Some keys are "locked" (read-only in UI, require code change).

### Query: Read All Config

```sql
SELECT key, value, updated_at
FROM platform_config
WHERE key IN (
  -- Measurement & charge switches
  'pickup_measurement_enabled',
  'pickup_fee_enabled',

  -- Free radius per category
  'pickup_free_radius_km_bike',
  'pickup_free_radius_km_cng',
  'pickup_free_radius_km_car',

  -- Rate multipliers (locked)
  'pickup_rate_multiplier_bike',
  'pickup_rate_multiplier_cng',
  'pickup_rate_multiplier_car',

  -- Cap (locked)
  'pickup_cap_billable_km_bike',
  'pickup_cap_billable_km_cng',
  'pickup_cap_billable_km_car',
  'pickup_cap_pct_of_fare',

  -- Reference pool (locked)
  'pickup_reference_pool_size',
  'pickup_reference_quantile',

  -- True-up & confidence (locked)
  'pickup_trueup_cap_multiplier',
  'pickup_origin_confidence_min',
  'pickup_low_confidence_never_bills_above_firm_quote',

  -- Pin edit rules (locked)
  'pickup_pin_tolerance_m',
  'pickup_max_forced_requotes',

  -- Heat engine
  'heat_baseline_weight',
  'hot_pct_threshold',
  'cold_pct_threshold',
  'heat_ewma_halflife_minutes',
  'heat_baseline_window_hours',
  'heat_backtest_correlation',

  -- Cancel survey
  'cancel_survey_enabled',
  'cancel_survey_cooldown_hours'
);
```

**Note:** The API reads ALL `platform_config` rows (not just the fare framework subset). The UI filters to display only the fare-relevant keys. The `ALLOWED_KEYS` set in the PATCH handler restricts which keys can be modified.

### Query: Update Config

```sql
-- Upsert pattern (Drizzle onConflictDoUpdate):
INSERT INTO platform_config (key, value, updated_at)
VALUES ($key, $value, now())
ON CONFLICT (key)
DO UPDATE SET value = $value, updated_at = now();
```

**Table:** `platform_config` (key-value store)
**Behavior:** Never cached. Reads from DB at every request. Admin changes take effect without restart.

### Config Key Reference

| Key | Type | Default | Locked | Description |
|-----|------|---------|--------|-------------|
| `pickup_measurement_enabled` | boolean | `false` | No | Stage 0 hinge — harvests samples with zero rider impact |
| `pickup_fee_enabled` | boolean | `false` | No | Stage 1 rider-charge switch |
| `pickup_free_radius_km_bike` | number | `0.5` | No | Free radius for bike category (km) |
| `pickup_free_radius_km_cng` | number | `0.5` | No | Free radius for CNG category (km) |
| `pickup_free_radius_km_car` | number | `0.5` | No | Free radius for car category (km) |
| `pickup_rate_multiplier_bike` | rate | `0.75` | Yes | Per-km rate multiplier for bike pickup |
| `pickup_rate_multiplier_cng` | rate | `0.75` | Yes | Per-km rate multiplier for CNG pickup |
| `pickup_rate_multiplier_car` | rate | `0.75` | Yes | Per-km rate multiplier for car pickup |
| `pickup_cap_billable_km_bike` | number | `2.0` | Yes | Max billable pickup km for bike |
| `pickup_cap_billable_km_cng` | number | `2.5` | Yes | Max billable pickup km for CNG |
| `pickup_cap_billable_km_car` | number | `3.0` | Yes | Max billable pickup km for car |
| `pickup_cap_pct_of_fare` | rate | `0.40` | Yes | Backstop: pickup fee ≤ 40% of trip fare |
| `pickup_reference_pool_size` | number | `30` | Yes | Rolling window size for reference pool |
| `pickup_reference_quantile` | rate | `0.70` | Yes | Quantile of reference pool for firm quote |
| `pickup_trueup_cap_multiplier` | number | `1.25` | Yes | Upward true-up capped at firm × 1.25 |
| `pickup_origin_confidence_min` | rate | `0.70` | Yes | Below this → freeze at firm quote |
| `pickup_pin_tolerance_m` | number | `200` | Yes | Rider can move pin within this radius (m) |
| `pickup_max_forced_requotes` | number | `2` | Yes | Max forced requotes per ride |

---

## Scheduler Jobs Backing These Screens

| Job | Interval | Purpose | Tables Written |
|-----|----------|---------|----------------|
| Live heatmap (job 34) | 60s | Compute EWMA scores, tags, idle counts | `zone_heat` (upsert) |
| Baseline heatmap (job 35) | 15min | Recompute trailing baseline percentiles | `zone_heat` (update `baseline_pct`) |
| Weekly backtest (job 37) | Weekly | Correlate predicted vs actual pickup fees | `platform_config` (`heat_backtest_correlation`) |
| Stale offer sweep (job 20) | 10s | Flip stale `delivered` offers to `expired` | `dispatch_offers` |
| Stale rides (job 3) | 60s | Cancel rides stuck in `dispatching` > 60s | `rides` (status → `expired`) |
| Fraud detection (in dispatch) | Per-dispatch | Flag dawdle/off-platform/cancel patterns | `fraud_flags` (insert) |

---

## Key Invariants

1. **Heat scores are EWMA-blended:** `score = 0.4 × baseline_pctile + 0.6 × live_pctile` (configurable via `heat_baseline_weight`).
2. **Suggest score is relative-density:** `suggest_score = score / (1 + idle_drivers)`. A hot zone with many idle drivers ranks lower than one with few.
3. **Pickup fee charging incidence target:** 25–30% of rides within a category × zone should be charged. Outside this range → recalibrate free radius.
4. **True-up asymmetry:** Downward adjustments are uncapped (rider-favorable); upward capped at firm × 1.25.
5. **Low-confidence freeze:** When GPS confidence < `pickup_origin_confidence_min`, bill the firm quote with no true-up.
6. **Platform config is never cached:** Every API read hits the DB. Admin changes are immediate.
7. **Fraud flags have a 5-day SLA:** Items older than 5 business days are overdue.
