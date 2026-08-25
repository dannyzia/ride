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
] as const;

export type FareFrameworkConfigKey = (typeof FARE_FRAMEWORK_CONFIG_KEYS)[number];

/** Default values for all framework config keys. */
export const FARE_FRAMEWORK_DEFAULTS: Record<FareFrameworkConfigKey, string> = {
  pickup_measurement_enabled: 'true',
  pickup_fee_enabled: 'false',
  pickup_free_radius_km_bike: '0',
  pickup_free_radius_km_cng: '0',
  pickup_free_radius_km_car: '0',
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
