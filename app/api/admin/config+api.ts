// Auth: requireAdminPermission via adminRbac — key-level enforcement in PATCH
import { db } from '../../../src/db';
import { platformConfig, configAuditLog } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission, isOwner, OWNER_ONLY_CONFIG_KEYS, GUARDRAIL_KM_KEYS, guardrailViolation } from '../../../lib/adminRbac';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const patchSchema = z.object({
  updates: z.array(z.object({ key: z.string().min(1), value: z.string() })).min(1),
});

const ALLOWED_KEYS = new Set([
  // Legacy keys
  'driver_min_ratio',
  'driver_max_ratio',
  'brta_max_base_bdt',
  'brta_max_per_km_bdt',
  'brta_max_wait_per_2min_bdt',
  'zone_multi_active_enabled',
  'sos_cooldown_seconds',
  'sos_auto_resolve_seconds',
  'schedule_min_lead_minutes',
  'schedule_max_lead_days',
  'cancel_grace_period_seconds',

  // Fare framework — measurement & charge switches
  'pickup_measurement_enabled',
  'pickup_fee_enabled',

  // Fare framework — free radius per category
  'pickup_free_radius_km_bike',
  'pickup_free_radius_km_cng',
  'pickup_free_radius_km_car',

  // Fare framework — rate multipliers (locked)
  'pickup_rate_multiplier_bike',
  'pickup_rate_multiplier_cng',
  'pickup_rate_multiplier_car',

  // Fare framework — cap (locked)
  'pickup_cap_billable_km_bike',
  'pickup_cap_billable_km_cng',
  'pickup_cap_billable_km_car',
  'pickup_cap_pct_of_fare',

  // Fare framework — reference pool (locked)
  'pickup_reference_pool_size',
  'pickup_reference_quantile',

  // Fare framework — true-up & confidence (locked)
  'pickup_trueup_cap_multiplier',
  'pickup_origin_confidence_min',
  'pickup_low_confidence_never_bills_above_firm_quote',

  // Fare framework — pin edit rules (locked)
  'pickup_pin_tolerance_m',
  'pickup_max_forced_requotes',

  // Fare framework — trace filter
  'pickup_trace_max_segment_speed_kmh',

  // Fare framework — zero-pool fallback
  'pickup_no_driver_fallback_km',

  // Fare framework — cold-drop boost
  'cold_drop_boost_enabled',
  'cold_drop_boost_multiplier',
  'cold_drop_boost_decay_minutes',
  'return_lead_affinity_multiplier',

  // Fare framework — new-driver protection
  'new_driver_priority_days',
  'new_driver_priority_leads',

  // Fare framework — heat engine
  'heat_blend_baseline_weight',
  'heat_baseline_earnings_minutes',
  'heat_baseline_window_days',
  'heat_live_ewma_halflife_minutes',
  'heat_tag_hot_pct',
  'heat_tag_cold_pct',
  'heat_idle_threshold_minutes',

  // Fare framework — dawdle guard
  'dawdle_rolling_pickups',
  'dawdle_median_threshold',
  'dawdle_p90_threshold',
  'dawdle_zone_margin',
  'dawdle_window_days',
  'dawdle_escalation_windows',

  // Fare framework — zone recalibration
  'zone_recal_deviation_pct',
  'zone_recal_min_sample_rides',
  'zone_recal_review_sla_days',
  'pickup_low_confidence_zone_ids',

  // Fare framework — fraud & cancel
  'proximity_cancel_cooldown_minutes',
  'cancel_rate_package_gate_pct',
  'offplatform_trace_overlap_pct',

  // Fare framework — dispatch
  'dispatch_offer_ttl_seconds',

  // Fare framework — heat backtest (read-only, written by backtest job)
  'heat_backtest_correlation',

  // Fare framework — stage label
  'fare_framework_stage',

  // Owner-only keys (added for RBAC — owner-only enforced in PATCH)
  'zone_fee_enabled',
  'night_mult_value',
  'night_schedule',
  'pickup_cap_pct_of_fare_v6',

  // Fare engine — fuel prices (admin-tier, editable via fare-config)
  'fuel_price_octane_bdt',
  'fuel_price_petrol_bdt',
  'fuel_price_cng_bdt',

  // Fare engine — per-tier fuel efficiency (km/L or km/m³)
  'fuel_efficiency_bike_basic',
  'fuel_efficiency_bike_standard',
  'fuel_efficiency_bike_plus',
  'fuel_efficiency_cng',
  'fuel_efficiency_car_compact',
  'fuel_efficiency_car_economy',
  'fuel_efficiency_car_comfort',
  'fuel_efficiency_car_premium',
  'fuel_efficiency_car_xl',

  // Fare engine — driver maintenance per km (paisa)
  'driver_maint_per_km_bike',
  'driver_maint_per_km_cng',
  'driver_maint_per_km_car',

  // Fare engine — daily target per tier (paisa)
  'daily_target_bdt_bike',
  'daily_target_bdt_cng',
  'daily_target_bdt_car',

  // Fare engine — expected billed minutes per tier
  'expected_billed_minutes_bike',
  'expected_billed_minutes_cng',
  'expected_billed_minutes_car',

  // Fare engine — joma recovery (taka-scale)
  'joma_monthly_bdt_bike_eco',
  'joma_monthly_bdt_bike_std',
  'joma_monthly_bdt_bike_prem',
  'joma_daily_bdt_cng',
  'joma_operating_days_per_month',
]);

const BOOLEAN_KEYS = new Set([
  'zone_multi_active_enabled',
  'pickup_measurement_enabled',
  'pickup_fee_enabled',
  'pickup_low_confidence_never_bills_above_firm_quote',
  'cold_drop_boost_enabled',
  'zone_fee_enabled',
]);

const CSV_KEYS = new Set([
  'dawdle_escalation_windows',
  'pickup_low_confidence_zone_ids',
]);

const ENUM_KEYS: Record<string, Set<string>> = {
  fare_framework_stage: new Set(['stage0', 'stage1', 'stage2', 'stage3']),
  night_schedule: new Set(['20:00-06:00']),
};

function validateKeyValue(key: string, value: string): string | null {
  if (!ALLOWED_KEYS.has(key)) return `Unknown key: ${key}`;

  // Boolean keys
  if (BOOLEAN_KEYS.has(key)) {
    if (value !== 'true' && value !== 'false') {
      return `${key} must be 'true' or 'false'`;
    }
    return null;
  }

  // CSV keys — accept any string
  if (CSV_KEYS.has(key)) return null;

  // Enum keys
  if (key in ENUM_KEYS) {
    if (!ENUM_KEYS[key].has(value)) {
      return `${key} must be one of: ${[...ENUM_KEYS[key]].join(', ')}`;
    }
    return null;
  }

  // Numeric keys — all remaining
  const v = parseFloat(value);
  if (!Number.isFinite(v)) {
    return `Value for ${key} must be numeric, got: ${value}`;
  }

  // Per-key range validation
  if (key === 'driver_min_ratio' || key === 'driver_max_ratio') {
    if (v < 0.10 || v > 5.00) return `${key} must be between 0.10 and 5.00`;
  }
  if (key === 'sos_cooldown_seconds') {
    if (!Number.isInteger(v) || v < 0 || v > 7200) return 'sos_cooldown_seconds must be 0–7200 (0–2 hours)';
  }
  if (key === 'sos_auto_resolve_seconds') {
    if (!Number.isInteger(v) || v < 60 || v > 14400) return 'sos_auto_resolve_seconds must be 60–14400 (1 min – 4 hours)';
  }
  if (key === 'schedule_min_lead_minutes') {
    if (!Number.isInteger(v) || v < 5 || v > 120) return 'schedule_min_lead_minutes must be 5–120';
  }
  if (key === 'schedule_max_lead_days') {
    if (!Number.isInteger(v) || v < 1 || v > 30) return 'schedule_max_lead_days must be 1–30';
  }
  if (key === 'cancel_grace_period_seconds') {
    if (!Number.isInteger(v) || v < 0 || v > 600) return 'cancel_grace_period_seconds must be 0–600 (0–10 min)';
  }

  // Pickup free radius: 0 or positive km
  if (key.startsWith('pickup_free_radius_km_')) {
    if (v < 0) return `${key} must be >= 0`;
  }

  // Rate multipliers: 0–1 range (locked values 0.75/0.80/0.90)
  if (key.startsWith('pickup_rate_multiplier_')) {
    if (v < 0 || v > 1) return `${key} must be between 0 and 1`;
  }

  // Cap billable km: positive
  if (key.startsWith('pickup_cap_billable_km_')) {
    if (v <= 0) return `${key} must be > 0`;
  }

  // Cap pct of fare: 0–100
  if (key === 'pickup_cap_pct_of_fare') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }

  // Reference pool size: positive integer
  if (key === 'pickup_reference_pool_size') {
    if (!Number.isInteger(v) || v < 1) return `${key} must be a positive integer`;
  }

  // Reference quantile: 0–1
  if (key === 'pickup_reference_quantile') {
    if (v < 0 || v > 1) return `${key} must be between 0 and 1`;
  }

  // True-up cap multiplier: >= 1
  if (key === 'pickup_trueup_cap_multiplier') {
    if (v < 1) return `${key} must be >= 1`;
  }

  // Origin confidence min: 0–1
  if (key === 'pickup_origin_confidence_min') {
    if (v < 0 || v > 1) return `${key} must be between 0 and 1`;
  }

  // Pin tolerance: positive meters
  if (key === 'pickup_pin_tolerance_m') {
    if (v <= 0) return `${key} must be > 0`;
  }

  // Max forced requotes: non-negative integer
  if (key === 'pickup_max_forced_requotes') {
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`;
  }

  // Trace max segment speed: positive
  if (key === 'pickup_trace_max_segment_speed_kmh') {
    if (v <= 0) return `${key} must be > 0`;
  }

  // No driver fallback km: positive
  if (key === 'pickup_no_driver_fallback_km') {
    if (v <= 0) return `${key} must be > 0`;
  }

  // Cold-drop boost multiplier: >= 1
  if (key === 'cold_drop_boost_multiplier') {
    if (v < 1) return `${key} must be >= 1`;
  }

  // Cold-drop boost decay minutes: positive
  if (key === 'cold_drop_boost_decay_minutes') {
    if (v <= 0) return `${key} must be > 0`;
  }

  // Return lead affinity multiplier: >= 1
  if (key === 'return_lead_affinity_multiplier') {
    if (v < 1) return `${key} must be >= 1`;
  }

  // New driver priority days: non-negative integer
  if (key === 'new_driver_priority_days') {
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`;
  }

  // New driver priority leads: non-negative integer
  if (key === 'new_driver_priority_leads') {
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`;
  }

  // Heat blend baseline weight: 0–1
  if (key === 'heat_blend_baseline_weight') {
    if (v < 0 || v > 1) return `${key} must be between 0 and 1`;
  }

  // Heat baseline earnings minutes: positive integer
  if (key === 'heat_baseline_earnings_minutes') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }

  // Heat baseline window days: positive integer
  if (key === 'heat_baseline_window_days') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }

  // Heat live EWMA halflife minutes: positive
  if (key === 'heat_live_ewma_halflife_minutes') {
    if (v <= 0) return `${key} must be > 0`;
  }

  // Heat tag hot pct: 0–100
  if (key === 'heat_tag_hot_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }

  // Heat tag cold pct: 0–100
  if (key === 'heat_tag_cold_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }

  // Heat idle threshold minutes: positive
  if (key === 'heat_idle_threshold_minutes') {
    if (v <= 0) return `${key} must be > 0`;
  }

  // Dawdle rolling pickups: positive integer
  if (key === 'dawdle_rolling_pickups') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }

  // Dawdle thresholds: > 1
  if (key === 'dawdle_median_threshold') {
    if (v <= 1) return `${key} must be > 1`;
  }
  if (key === 'dawdle_p90_threshold') {
    if (v <= 1) return `${key} must be > 1`;
  }

  // Dawdle zone margin: non-negative
  if (key === 'dawdle_zone_margin') {
    if (v < 0) return `${key} must be >= 0`;
  }

  // Dawdle window days: positive integer
  if (key === 'dawdle_window_days') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }

  // Zone recal deviation pct: 0–100
  if (key === 'zone_recal_deviation_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }

  // Zone recal min sample rides: non-negative integer
  if (key === 'zone_recal_min_sample_rides') {
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`;
  }

  // Zone recal review SLA days: positive integer
  if (key === 'zone_recal_review_sla_days') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }

  // Proximity cancel cooldown minutes: non-negative
  if (key === 'proximity_cancel_cooldown_minutes') {
    if (v < 0) return `${key} must be >= 0`;
  }

  // Cancel rate package gate pct: 0–100
  if (key === 'cancel_rate_package_gate_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }

  // Offplatform trace overlap pct: 0–100
  if (key === 'offplatform_trace_overlap_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }

  // Dispatch offer TTL: positive integer seconds
  if (key === 'dispatch_offer_ttl_seconds') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }

  // Heat backtest correlation: -1 to 1 (or empty string for unset)
  if (key === 'heat_backtest_correlation') {
    if (value === '') return null; // empty = unset
    if (v < -1 || v > 1) return `${key} must be between -1 and 1`;
  }

  // Night multiplier: 1.0–3.0
  if (key === 'night_mult_value') {
    if (v < 1.0 || v > 3.0) return `${key} must be between 1.0 and 3.0`;
  }

  // Fare engine — fuel prices (BDT, positive)
  if (key.startsWith('fuel_price_')) {
    if (v <= 0) return `${key} must be > 0 (BDT per litre or m³)`;
  }

  // Fare engine — fuel efficiency (km/L or km/m³, positive)
  if (key.startsWith('fuel_efficiency_')) {
    if (v <= 0) return `${key} must be > 0 (km per litre or m³)`;
  }

  // Fare engine — driver maintenance per km (paisa, positive)
  if (key.startsWith('driver_maint_per_km_')) {
    if (v <= 0) return `${key} must be > 0 (paisa per km)`;
  }

  // Fare engine — daily target (paisa, positive)
  if (key.startsWith('daily_target_bdt_')) {
    if (v <= 0) return `${key} must be > 0 (paisa per day)`;
  }

  // Fare engine — expected billed minutes (positive integer)
  if (key.startsWith('expected_billed_minutes_')) {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer (minutes)`;
  }

  // Fare engine — joma (taka-scale, non-negative)
  if (key.startsWith('joma_')) {
    if (v < 0) return `${key} must be >= 0 (BDT)`;
  }

  return null;
}

export async function GET(req: Request) {
  try {
    await requireAdminPermission('config.write')(req);
    const config = await db.select().from(platformConfig);
    return Response.json({ config });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/config] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabaseUser: admin, dbUser } = await requireAdminPermission('config.write')(req);

    const result = await parseJsonBody(req, patchSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const validationErrors: string[] = [];
    for (const { key, value } of body.updates) {
      const err = validateKeyValue(key, value);
      if (err) validationErrors.push(err);
    }
    if (validationErrors.length) {
      return Response.json({ error: 'validation_failed', message: validationErrors.join('; ') }, { status: 400 });
    }

    // RBAC: owner-only key enforcement
    if (!isOwner(dbUser)) {
      for (const { key } of body.updates) {
        if (OWNER_ONLY_CONFIG_KEYS.has(key)) {
          return Response.json({ error: 'forbidden', message: `Key '${key}' is owner-only` }, { status: 403 });
        }
      }
    }

    // RBAC: guardrail enforcement for ops_manager
    if (dbUser.role === 'ops_manager') {
      for (const { key, value } of body.updates) {
        const numericVal = parseFloat(value);
        if (!Number.isFinite(numericVal)) continue;
        // Read current value for guardrail check
        const [currentRow] = await db.select({ value: platformConfig.value })
          .from(platformConfig)
          .where(eq(platformConfig.key, key))
          .limit(1);
        const currentVal = currentRow?.value ? parseFloat(currentRow.value) : null;
        if (guardrailViolation(key, currentVal, numericVal)) {
          return Response.json({ error: 'guardrail_violation', message: `Key '${key}' change exceeds ±${GUARDRAIL_KM_KEYS.has(key) ? '0.25km' : '1min'} guardrail — requires owner` }, { status: 403 });
        }
      }
    }

    // Phase D: config audit — log every change before applying
    for (const { key, value } of body.updates) {
      if (!ALLOWED_KEYS.has(key)) continue;
      // Read old value for audit
      const [oldRow] = await db.select({ value: platformConfig.value })
        .from(platformConfig)
        .where(eq(platformConfig.key, key))
        .limit(1);
      // Insert audit log BEFORE the update (REV-5: actor_role populated)
      await db.insert(configAuditLog).values({
        config_key: key,
        old_value: oldRow?.value ?? null,
        new_value: value,
        admin_id: admin.id,
        actor_role: dbUser.role,
      });
      await db.update(platformConfig)
        .set({ value, updated_at: new Date() })
        .where(eq(platformConfig.key, key));
    }

    logger.info('[admin/config] updated', {
      keys: body.updates.map((u) => u.key),
      adminId: admin.id,
    });

    const config = await db.select().from(platformConfig);
    return Response.json({ config });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/config] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
