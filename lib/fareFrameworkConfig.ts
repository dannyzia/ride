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

  // Parking per km (paisa)
  'parking_per_km_bike',
  'parking_per_km_cng',
  'parking_per_km_car',

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
  'pickup_free_time_min_bike', // 3 min
  'pickup_free_time_min_cng', // 4 min
  'pickup_free_time_min_car', // 5 min

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

  // Fuel recompute trigger (admin sets to 'true', job 45 clears)
  'fuel_recompute_pending',
] as const;

export type FareFrameworkConfigKey = (typeof FARE_FRAMEWORK_CONFIG_KEYS)[number];

/** Default values for all framework config keys. */
export const FARE_FRAMEWORK_DEFAULTS: Record<FareFrameworkConfigKey, string> = {
  pickup_measurement_enabled: 'true',
  pickup_fee_enabled: 'false',
  pickup_free_radius_km_bike: '1.0',
  pickup_free_radius_km_cng: '1.2',
  pickup_free_radius_km_car: '1.5',
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
  new_driver_priority_leads: '0',
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
  fuel_price_petrol_bdt: '145',
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
  parking_per_km_bike: '10',
  parking_per_km_cng: '15',
  parking_per_km_car: '20',
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
  pickup_free_time_min_bike: '3',
  pickup_free_time_min_cng: '4',
  pickup_free_time_min_car: '5',
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
