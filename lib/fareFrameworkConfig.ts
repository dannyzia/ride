/**
 * Ride Fare Framework v1 — configuration module.
 *
 * Mirrors lib/platformConfig.ts: fresh read from platform_config every call,
 * no caching. Keys are strings in platform_config.value.
 *
 * Used by both Expo API routes (root package) and utils-server (via relative
 * import, same pattern as lib/hotspots.ts).
 */

import { db } from '../src/db';
import { platformConfig } from '../src/db/schema';
import { inArray } from 'drizzle-orm';

export const FARE_FRAMEWORK_CONFIG_KEYS = [
  // Measurement & charge switches
  'pickup_measurement_enabled',
  'pickup_fee_enabled',

  // Free radius (per category — 0 = invalid; estimate/request treat unset as feature-off)
  'pickup_free_radius_km_bike',
  'pickup_free_radius_km_cng',
  'pickup_free_radius_km_car',

  // Rate multipliers (locked — display basis is absolute ৳/km, multiplier never exposed)
  'pickup_rate_multiplier_bike',
  'pickup_rate_multiplier_cng',
  'pickup_rate_multiplier_car',

  // Cap (locked)
  'pickup_cap_billable_km_bike',
  'pickup_cap_billable_km_cng',
  'pickup_cap_billable_km_car',
  'pickup_cap_pct_of_fare',

  // Reference pool (locked)
  'pickup_reference_pool_size',
  'pickup_reference_quantile',

  // True-up & confidence (locked)
  'pickup_trueup_cap_multiplier',
  'pickup_origin_confidence_min',
  'pickup_low_confidence_never_bills_above_firm_quote',

  // Pin edit rules (locked)
  'pickup_pin_tolerance_m',
  'pickup_max_forced_requotes',

  // Trace filter (admin-adjustable)
  'pickup_trace_max_segment_speed_kmh',

  // Zero-pool fallback (admin-adjustable)
  'pickup_no_driver_fallback_km',

  // Cold-drop boost (Lever 2)
  'cold_drop_boost_enabled',
  'cold_drop_boost_multiplier',
  'cold_drop_boost_decay_minutes',
  'return_lead_affinity_multiplier',

  // New-driver protection
  'new_driver_priority_days',
  'new_driver_priority_leads',

  // Heat engine
  'heat_blend_baseline_weight',
  'heat_baseline_earnings_minutes',
  'heat_baseline_window_days',
  'heat_live_ewma_halflife_minutes',
  'heat_tag_hot_pct',
  'heat_tag_cold_pct',
  'heat_idle_threshold_minutes',

  // Dawdle guard (locked)
  'dawdle_rolling_pickups',
  'dawdle_median_threshold',
  'dawdle_p90_threshold',
  'dawdle_zone_margin',
  'dawdle_window_days',
  'dawdle_escalation_windows',

  // Zone recalibration
  'zone_recal_deviation_pct',
  'zone_recal_min_sample_rides',
  'zone_recal_review_sla_days',
  'pickup_low_confidence_zone_ids',

  // Fraud & cancel
  'proximity_cancel_cooldown_minutes',
  'cancel_rate_package_gate_pct',
  'offplatform_trace_overlap_pct',

  // Dispatch
  'dispatch_offer_ttl_seconds',

  // Heat backtest (read-only, written by weekly backtest job)
  'heat_backtest_correlation',

  // Label
  'fare_framework_stage',

  // ════════════════════════════════════════════════════════════════
  // Fare Framework v6 — new config keys (§4, §9)
  // ════════════════════════════════════════════════════════════════

  // Night multiplier
  'night_mult_value', // 1.000 = disabled, e.g. 1.200 = 20% night surcharge
  'night_schedule', // JSON array of {start_hour, end_hour, value}

  // Fuel prices (BDT, admin-updatable)
  'fuel_price_octane_bdt',
  'fuel_price_petrol_bdt',
  'fuel_price_cng_bdt',

  // Per-tier fuel efficiency (km/L or km/m³)
  'fuel_efficiency_bike_basic',
  'fuel_efficiency_bike_standard',
  'fuel_efficiency_bike_plus',
  'fuel_efficiency_cng',
  'fuel_efficiency_car_compact',
  'fuel_efficiency_car_economy',
  'fuel_efficiency_car_comfort',
  'fuel_efficiency_car_premium',
  'fuel_efficiency_car_xl',

  // Driver maintenance per km (paisa) — 50% of total maint
  'driver_maint_per_km_bike',
  'driver_maint_per_km_cng',
  'driver_maint_per_km_car',

  // REV-4: bike joma three-tier monthly (owner ruling) — parking is owner-borne,
  // recovered inside joma. Values are taka-scale like fuel_price_* (NOT paisa).
  'joma_bike_eco_monthly_bdt', // 8000 BDT/month
  'joma_bike_std_monthly_bdt', // 10000 BDT/month
  'joma_bike_prem_monthly_bdt', // 12000 BDT/month
  'joma_cng_daily_bdt', // 800 BDT/day
  'joma_operating_days_per_month', // plain count (26)

  // Daily target per category (paisa)
  'daily_target_bdt_bike',
  'daily_target_bdt_cng',
  'daily_target_bdt_car',

  // Expected billed minutes per category
  'expected_billed_minutes_bike',
  'expected_billed_minutes_cng',
  'expected_billed_minutes_car',

  // Zone fee
  'zone_fee_enabled', // false (inert in Stage 0)
  'zone_fee_entry_threshold_min', // 30
  'zone_fee_exit_threshold_min', // 20
  'zone_fee_coverage_factor', // 0.55

  // Pickup v6 (REV-3)
  'pickup_rate_basis', // 1.0 (locked — flat 1.0×, no multiplier)
  'pickup_free_time_min_bike', // 5 min (REV-4)
  'pickup_free_time_min_cng', // 5 min (REV-4)
  'pickup_free_time_min_car', // 10 min (REV-4)

  // Pickup v6 cap (backstop 25% — was 40% at old 0.75×)
  'pickup_cap_pct_of_fare_v6', // 25 (overrides v1's 40)

  // Grace (waiting): single source of truth = pricing.free_wait_minutes
  // waiting_rate_mode = same_as_time_rate (locked, no config key needed)

  // Dawdle guard — time dimension (complements existing distance keys)
  'dawdle_time_median_threshold', // 1.20
  'dawdle_time_p90_threshold', // 1.40

  // Gate metrics thresholds (admin-adjustable before Stage 1)
  'fare_gate_complaint_rate_max', // 5 (per 1k rides)
  'fare_gate_deviation_max_pct', // 15
  'fare_gate_periphery_drop_max_pp', // 5
  'fare_gate_backstop_binding_max_pct', // 40
  'fare_gate_retention_drop_max_pp', // 5
  'fare_gate_heat_correlation_min', // 0.3

  // Fuel recompute trigger — read by scheduler job 45 (not settable via admin API).
  // A-6b is Stage-1 work; flag is preserved until recompute pipeline is built.
  'fuel_recompute_pending',

  // ════════════════════════════════════════════════════════════════
  // Decision v1 — per-tier calibration values (Stage 0 shadow)
  // These are more granular than the per-category keys above.
  // Stored as paisa integers unless noted. Source: Decision v1.md.
  // ════════════════════════════════════════════════════════════════

  // Per-tier fuel prices (paisa — existing per-category keys store BDT;
  // these duplicate for the v2 engine that reads per-tier directly)
  'fuel_price_bike_petrol_bdt_per_l',  // 14000 paisa = 140 BDT/L
  'fuel_price_cng_bdt_per_m3',         // 4300 paisa = 43 BDT/m³
  'fuel_price_cars_octane_bdt_per_l',  // 14500 paisa = 145 BDT/L

  // Per-tier fuel efficiency (decimal string — km/L or km/m³)
  'fare_efficiency_bike_125_km_per_l',   // 40
  'fare_efficiency_bike_150_km_per_l',   // 35
  'fare_efficiency_cng_km_per_m3',       // 20
  'fare_efficiency_car_eco_km_per_l',    // 9.5 (decimal string)
  'fare_efficiency_car_std_km_per_l',    // 8
  'fare_efficiency_car_prem_km_per_l',   // 7
  'fare_efficiency_car_xl_km_per_l',     // 12 (hybrid)

  // Per-tier maintenance — BDT/month stored as paisa (×100)
  'fare_maintenance_bike_125_bdt_per_month',  // 185000 paisa = 1850 BDT
  'fare_maintenance_bike_150_bdt_per_month',  // 210000 paisa = 2100 BDT
  'fare_maintenance_cng_bdt_per_month',       // 450000 paisa = 4500 BDT
  'fare_maintenance_car_eco_bdt_per_month',   // 525000 paisa = 5250 BDT
  'fare_maintenance_car_std_bdt_per_month',   // 725000 paisa = 7250 BDT
  'fare_maintenance_car_prem_bdt_per_month',  // 1050000 paisa = 10500 BDT
  'fare_maintenance_car_xl_bdt_per_month',    // 1150000 paisa = 11500 BDT

  // Joma — driver-paid rent (paisa)
  'fare_joma_bike_125_bdt_per_month',     // 800000 paisa = 8000 BDT
  'fare_joma_bike_150_bdt_per_month',     // 1000000 paisa = 10000 BDT
  'fare_joma_bike_premium_bdt_per_month', // 1200000 paisa = 12000 BDT
  'fare_joma_cng_bdt_per_day',            // 80000 paisa = 800 BDT
  'fare_joma_cars_pct_of_net',            // 5000 = 50.00%

  // Per-tier daily targets (paisa)
  'fare_daily_target_bike_125_bdt',   // 85000 paisa = 850 BDT
  'fare_daily_target_bike_150_bdt',   // 92500 paisa = 925 BDT
  'fare_daily_target_cng_bdt',        // 95000 paisa = 950 BDT
  'fare_daily_target_car_eco_bdt',    // 120000 paisa = 1200 BDT
  'fare_daily_target_car_std_bdt',    // 150000 paisa = 1500 BDT
  'fare_daily_target_car_prem_bdt',   // 200000 paisa = 2000 BDT
  'fare_daily_target_car_xl_bdt',     // 220000 paisa = 2200 BDT

  // Per-tier churn alarms (paisa — monitor only, Stage 0 telemetry)
  'fare_churn_alarm_bike_125_bdt',  // 65000 paisa = 650 BDT
  'fare_churn_alarm_bike_150_bdt',  // 70000 paisa = 700 BDT
  'fare_churn_alarm_cng_bdt',       // 73000 paisa = 730 BDT
  'fare_churn_alarm_car_eco_bdt',   // 89000 paisa = 890 BDT
  'fare_churn_alarm_car_std_bdt',   // 125000 paisa = 1250 BDT
  'fare_churn_alarm_car_prem_bdt',  // 170000 paisa = 1700 BDT
  'fare_churn_alarm_car_xl_bdt',    // 170000 paisa = 1700 BDT

  // Per-tier working hours (plain integer)
  'fare_working_hours_bike_125_per_day', // 11
  'fare_working_hours_bike_150_per_day', // 11
  'fare_working_hours_cng_per_day',      // 12
  'fare_working_hours_car_eco_per_day',  // 11
  'fare_working_hours_car_std_per_day',  // 11
  'fare_working_hours_car_prem_per_day', // 10
  'fare_working_hours_car_xl_per_day',   // 11

  // Per-tier trips per day (plain integer)
  'fare_trips_per_day_bike_125',  // 14
  'fare_trips_per_day_bike_150',  // 14
  'fare_trips_per_day_cng',       // 16
  'fare_trips_per_day_car_eco',   // 10
  'fare_trips_per_day_car_std',   // 9
  'fare_trips_per_day_car_prem',  // 8
  'fare_trips_per_day_car_xl',    // 7

  // Per-tier average trip km and minutes (km stored as ×100 integer, min as seconds)
  'fare_avg_trip_km_bike_125',  // 450 (4.50 km)
  'fare_avg_trip_min_bike_125', // 1200 (20 min = 1200s)
  'fare_avg_trip_km_bike_150',  // 450
  'fare_avg_trip_min_bike_150', // 1200
  'fare_avg_trip_km_cng',       // 450
  'fare_avg_trip_min_cng',      // 1440 (24 min)
  'fare_avg_trip_km_car_eco',   // 600 (6 km)
  'fare_avg_trip_min_car_eco',  // 1740 (29 min)
  'fare_avg_trip_km_car_std',   // 650 (6.5 km)
  'fare_avg_trip_min_car_std',  // 1860 (31 min)
  'fare_avg_trip_km_car_prem',  // 800 (8 km)
  'fare_avg_trip_min_car_prem', // 2100 (35 min)
  'fare_avg_trip_km_car_xl',    // 900 (9 km)
  'fare_avg_trip_min_car_xl',   // 2100 (35 min)

  // Fare parameters — locked, Stage 0 calibrates
  'fare_free_radius_km_bike',       // 1000 (1.00 km)
  'fare_free_radius_km_cng',        // 1500 (1.50 km)
  'fare_free_radius_km_car',        // 2000 (2.00 km)
  'fare_free_pickup_min_bike',      // 5
  'fare_free_pickup_min_cng',       // 5
  'fare_free_pickup_min_car',       // 10
  'fare_free_wait_min_bike',        // 1
  'fare_free_wait_min_cng',         // 1
  'fare_free_wait_min_car',         // 2
  'fare_night_multiplier_disabled', // 100 (1.00×)
  'fare_backstop_pct',              // 0 (calibration-required)

  // Dispatch / leads (Decision v1)
  'fare_engine_current', // 'v2' shadow
] as const;

export type FareFrameworkConfigKey = (typeof FARE_FRAMEWORK_CONFIG_KEYS)[number];

/** Default values for all framework config keys. */
export const FARE_FRAMEWORK_DEFAULTS: Record<FareFrameworkConfigKey, string> = {
  pickup_measurement_enabled: 'true',
  pickup_fee_enabled: 'false',
  pickup_free_radius_km_bike: '1.0',
  pickup_free_radius_km_cng: '1.5', // REV-4: was 1.2
  pickup_free_radius_km_car: '2.0', // REV-4: was 1.5
  pickup_rate_multiplier_bike: '0.75',
  pickup_rate_multiplier_cng: '0.80',
  pickup_rate_multiplier_car: '0.90',
  pickup_cap_billable_km_bike: '2.0',
  pickup_cap_billable_km_cng: '2.0',
  pickup_cap_billable_km_car: '2.0',
  pickup_cap_pct_of_fare: '40',
  pickup_reference_pool_size: '5',
  pickup_reference_quantile: '0.75',
  pickup_trueup_cap_multiplier: '1.25',
  pickup_origin_confidence_min: '0.7',
  pickup_low_confidence_never_bills_above_firm_quote: 'true',
  pickup_pin_tolerance_m: '250',
  pickup_max_forced_requotes: '2',
  pickup_trace_max_segment_speed_kmh: '80',
  pickup_no_driver_fallback_km: '3.0',
  cold_drop_boost_enabled: 'true',
  cold_drop_boost_multiplier: '1.2',
  cold_drop_boost_decay_minutes: '15',
  return_lead_affinity_multiplier: '1.1',
  new_driver_priority_days: '7',
  new_driver_priority_leads: '10', // REV-4: was '0' (off) — first 10 leads priority
  heat_blend_baseline_weight: '0.4',
  heat_baseline_earnings_minutes: '60',
  heat_baseline_window_days: '28',
  heat_live_ewma_halflife_minutes: '30',
  heat_tag_hot_pct: '66',
  heat_tag_cold_pct: '33',
  heat_idle_threshold_minutes: '10',
  dawdle_rolling_pickups: '30',
  dawdle_median_threshold: '1.15',
  dawdle_p90_threshold: '1.35',
  dawdle_zone_margin: '0.10',
  dawdle_window_days: '14',
  dawdle_escalation_windows: '1,2,4',
  zone_recal_deviation_pct: '20',
  zone_recal_min_sample_rides: '0',
  zone_recal_review_sla_days: '5',
  pickup_low_confidence_zone_ids: '',
  proximity_cancel_cooldown_minutes: '15',
  cancel_rate_package_gate_pct: '30',
  offplatform_trace_overlap_pct: '60',
  dispatch_offer_ttl_seconds: '15',
  heat_backtest_correlation: '',
  fare_framework_stage: 'stage0',

  // v6 defaults
  night_mult_value: '1.000', // disabled
  night_schedule: '[]',
  fuel_price_octane_bdt: '145',
  fuel_price_petrol_bdt: '140', // REV-4: was 145
  fuel_price_cng_bdt: '43',
  fuel_efficiency_bike_basic: '45',
  fuel_efficiency_bike_standard: '40',
  fuel_efficiency_bike_plus: '33',
  fuel_efficiency_cng: '20',
  fuel_efficiency_car_compact: '12',
  fuel_efficiency_car_economy: '10',
  fuel_efficiency_car_comfort: '8',
  fuel_efficiency_car_premium: '10',
  fuel_efficiency_car_xl: '13',
  driver_maint_per_km_bike: '55',
  driver_maint_per_km_cng: '105',
  driver_maint_per_km_car: '345',
  // REV-4: bike joma three-tier monthly (taka-scale, like fuel_price_*) —
  // parking keys removed (parking is owner-borne, recovered inside joma)
  joma_bike_eco_monthly_bdt: '8000',
  joma_bike_std_monthly_bdt: '10000',
  joma_bike_prem_monthly_bdt: '12000',
  joma_cng_daily_bdt: '800',
  joma_operating_days_per_month: '26',
  daily_target_bdt_bike: '110000',
  daily_target_bdt_cng: '120000',
  daily_target_bdt_car: '125000',
  expected_billed_minutes_bike: '240',
  expected_billed_minutes_cng: '220',
  expected_billed_minutes_car: '200',
  zone_fee_enabled: 'false',
  zone_fee_entry_threshold_min: '30',
  zone_fee_exit_threshold_min: '20',
  zone_fee_coverage_factor: '0.55',
  pickup_rate_basis: '1.0',
  pickup_free_time_min_bike: '5', // REV-4: was 3
  pickup_free_time_min_cng: '5', // REV-4: was 4
  pickup_free_time_min_car: '10', // REV-4: was 5
  pickup_cap_pct_of_fare_v6: '25', // v6: was 40% at old 0.75×, tighter at 1.0×
  dawdle_time_median_threshold: '1.20',
  dawdle_time_p90_threshold: '1.40',
  fare_gate_complaint_rate_max: '5',
  fare_gate_deviation_max_pct: '15',
  fare_gate_periphery_drop_max_pp: '5',
  fare_gate_backstop_binding_max_pct: '40',
  fare_gate_retention_drop_max_pp: '5',
  fare_gate_heat_correlation_min: '0.3',
  fuel_recompute_pending: 'false',

  // Decision v1 — per-tier calibration values
  fuel_price_bike_petrol_bdt_per_l: '14000',  // 140 BDT/L in paisa
  fuel_price_cng_bdt_per_m3: '4300',          // 43 BDT/m³ in paisa
  fuel_price_cars_octane_bdt_per_l: '14500',  // 145 BDT/L in paisa

  fare_efficiency_bike_125_km_per_l: '40',
  fare_efficiency_bike_150_km_per_l: '35',
  fare_efficiency_cng_km_per_m3: '20',
  fare_efficiency_car_eco_km_per_l: '9.5',
  fare_efficiency_car_std_km_per_l: '8',
  fare_efficiency_car_prem_km_per_l: '7',
  fare_efficiency_car_xl_km_per_l: '12',

  fare_maintenance_bike_125_bdt_per_month: '185000',
  fare_maintenance_bike_150_bdt_per_month: '210000',
  fare_maintenance_cng_bdt_per_month: '450000',
  fare_maintenance_car_eco_bdt_per_month: '525000',
  fare_maintenance_car_std_bdt_per_month: '725000',
  fare_maintenance_car_prem_bdt_per_month: '1050000',
  fare_maintenance_car_xl_bdt_per_month: '1150000',

  fare_joma_bike_125_bdt_per_month: '800000',
  fare_joma_bike_150_bdt_per_month: '1000000',
  fare_joma_bike_premium_bdt_per_month: '1200000',
  fare_joma_cng_bdt_per_day: '80000',
  fare_joma_cars_pct_of_net: '5000',  // 50.00%

  fare_daily_target_bike_125_bdt: '85000',
  fare_daily_target_bike_150_bdt: '92500',
  fare_daily_target_cng_bdt: '95000',
  fare_daily_target_car_eco_bdt: '120000',
  fare_daily_target_car_std_bdt: '150000',
  fare_daily_target_car_prem_bdt: '200000',
  fare_daily_target_car_xl_bdt: '220000',

  fare_churn_alarm_bike_125_bdt: '65000',
  fare_churn_alarm_bike_150_bdt: '70000',
  fare_churn_alarm_cng_bdt: '73000',
  fare_churn_alarm_car_eco_bdt: '89000',
  fare_churn_alarm_car_std_bdt: '125000',
  fare_churn_alarm_car_prem_bdt: '170000',
  fare_churn_alarm_car_xl_bdt: '170000',

  fare_working_hours_bike_125_per_day: '11',
  fare_working_hours_bike_150_per_day: '11',
  fare_working_hours_cng_per_day: '12',
  fare_working_hours_car_eco_per_day: '11',
  fare_working_hours_car_std_per_day: '11',
  fare_working_hours_car_prem_per_day: '10',
  fare_working_hours_car_xl_per_day: '11',

  fare_trips_per_day_bike_125: '14',
  fare_trips_per_day_bike_150: '14',
  fare_trips_per_day_cng: '16',
  fare_trips_per_day_car_eco: '10',
  fare_trips_per_day_car_std: '9',
  fare_trips_per_day_car_prem: '8',
  fare_trips_per_day_car_xl: '7',

  fare_avg_trip_km_bike_125: '450',
  fare_avg_trip_min_bike_125: '1200',
  fare_avg_trip_km_bike_150: '450',
  fare_avg_trip_min_bike_150: '1200',
  fare_avg_trip_km_cng: '450',
  fare_avg_trip_min_cng: '1440',
  fare_avg_trip_km_car_eco: '600',
  fare_avg_trip_min_car_eco: '1740',
  fare_avg_trip_km_car_std: '650',
  fare_avg_trip_min_car_std: '1860',
  fare_avg_trip_km_car_prem: '800',
  fare_avg_trip_min_car_prem: '2100',
  fare_avg_trip_km_car_xl: '900',
  fare_avg_trip_min_car_xl: '2100',

  fare_free_radius_km_bike: '1000',
  fare_free_radius_km_cng: '1500',
  fare_free_radius_km_car: '2000',
  fare_free_pickup_min_bike: '5',
  fare_free_pickup_min_cng: '5',
  fare_free_pickup_min_car: '10',
  fare_free_wait_min_bike: '1',
  fare_free_wait_min_cng: '1',
  fare_free_wait_min_car: '2',
  fare_night_multiplier_disabled: '100',
  fare_backstop_pct: '0',

  fare_engine_current: 'v2',
};

/**
 * Read framework config values from platform_config.
 * Fresh every call (never cached) — mirrors lib/platformConfig.ts.
 */
export async function getFareFrameworkConfig<K extends FareFrameworkConfigKey>(
  keys: readonly K[],
): Promise<Record<K, string>> {
  const result = {} as Record<K, string>;

  // Set defaults first
  for (const key of keys) {
    result[key] = FARE_FRAMEWORK_DEFAULTS[key];
  }

  // Override from DB
  try {
    const rows = await db
      .select({ key: platformConfig.key, value: platformConfig.value })
      .from(platformConfig)
      .where(inArray(platformConfig.key, [...keys]));

    for (const row of rows) {
      if (row.key in result) {
        (result as Record<string, string>)[row.key] = row.value;
      }
    }
  } catch {
    // Return defaults on DB error
  }

  return result;
}

/**
 * Convenience: read a single config key.
 */
export async function getFareFrameworkConfigValue(
  key: FareFrameworkConfigKey,
): Promise<string> {
  const cfg = await getFareFrameworkConfig([key]);
  return cfg[key];
}

/**
 * Parse a config value as a number, falling back to default on error.
 */
export function parseConfigNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse a config value as a boolean string.
 */
export function parseConfigBool(value: string): boolean {
  return value === 'true';
}

/**
 * Parse a CSV config value into a string array.
 */
export function parseConfigCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Check if fare framework stage is 1 or higher (authoritative v6).
 * Reads fresh from DB every call (platform_config rule: never cache).
 * At stage0, v2 is authoritative and v6 is shadow.
 * At stage1+, v6 becomes authoritative.
 */
export async function isStage1Plus(): Promise<boolean> {
  const stage = await getFareFrameworkConfigValue('fare_framework_stage');
  return stage === 'stage1' || stage === 'stage2';
}
