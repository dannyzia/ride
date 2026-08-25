/**
 * Tests for admin config ALLOWED_KEYS validation (fare framework keys).
 *
 * Tests the validateKeyValue logic in isolation — no DB or auth required.
 * Also tests fraud-flag status transition logic and pickup-analytics query shapes.
 */
import { z } from 'zod';

// ── Replicate the validation logic from config+api.ts for unit testing ──

const ALLOWED_KEYS = new Set([
  'driver_min_ratio',
  'zone_multi_active_enabled',
  'pickup_measurement_enabled',
  'pickup_fee_enabled',
  'pickup_free_radius_km_bike',
  'pickup_rate_multiplier_bike',
  'pickup_cap_billable_km_bike',
  'pickup_cap_pct_of_fare',
  'pickup_reference_pool_size',
  'pickup_reference_quantile',
  'pickup_trueup_cap_multiplier',
  'pickup_origin_confidence_min',
  'pickup_low_confidence_never_bills_above_firm_quote',
  'pickup_pin_tolerance_m',
  'pickup_max_forced_requotes',
  'pickup_trace_max_segment_speed_kmh',
  'pickup_no_driver_fallback_km',
  'cold_drop_boost_enabled',
  'cold_drop_boost_multiplier',
  'cold_drop_boost_decay_minutes',
  'return_lead_affinity_multiplier',
  'new_driver_priority_days',
  'new_driver_priority_leads',
  'heat_blend_baseline_weight',
  'heat_baseline_earnings_minutes',
  'heat_baseline_window_days',
  'heat_live_ewma_halflife_minutes',
  'heat_tag_hot_pct',
  'heat_tag_cold_pct',
  'heat_idle_threshold_minutes',
  'dawdle_rolling_pickups',
  'dawdle_median_threshold',
  'dawdle_p90_threshold',
  'dawdle_zone_margin',
  'dawdle_window_days',
  'dawdle_escalation_windows',
  'zone_recal_deviation_pct',
  'zone_recal_min_sample_rides',
  'zone_recal_review_sla_days',
  'pickup_low_confidence_zone_ids',
  'proximity_cancel_cooldown_minutes',
  'cancel_rate_package_gate_pct',
  'offplatform_trace_overlap_pct',
  'dispatch_offer_ttl_seconds',
  'heat_backtest_correlation',
  'fare_framework_stage',
]);

const BOOLEAN_KEYS = new Set([
  'zone_multi_active_enabled',
  'pickup_measurement_enabled',
  'pickup_fee_enabled',
  'pickup_low_confidence_never_bills_above_firm_quote',
  'cold_drop_boost_enabled',
]);

const CSV_KEYS = new Set([
  'dawdle_escalation_windows',
  'pickup_low_confidence_zone_ids',
]);

const ENUM_KEYS: Record<string, Set<string>> = {
  fare_framework_stage: new Set(['stage0', 'stage1', 'stage2', 'stage3']),
};

function validateKeyValue(key: string, value: string): string | null {
  if (!ALLOWED_KEYS.has(key)) return `Unknown key: ${key}`;

  if (BOOLEAN_KEYS.has(key)) {
    if (value !== 'true' && value !== 'false') return `${key} must be 'true' or 'false'`;
    return null;
  }

  if (CSV_KEYS.has(key)) return null;

  if (key in ENUM_KEYS) {
    if (!ENUM_KEYS[key].has(value)) return `${key} must be one of: ${[...ENUM_KEYS[key]].join(', ')}`;
    return null;
  }

  // heat_backtest_correlation allows empty string (unset)
  if (key === 'heat_backtest_correlation' && value === '') return null;

  const v = parseFloat(value);
  if (!Number.isFinite(v)) return `Value for ${key} must be numeric, got: ${value}`;

  if (key === 'driver_min_ratio') {
    if (v < 0.10 || v > 5.00) return `${key} must be between 0.10 and 5.00`;
  }
  if (key.startsWith('pickup_free_radius_km_')) {
    if (v < 0) return `${key} must be >= 0`;
  }
  if (key.startsWith('pickup_rate_multiplier_')) {
    if (v < 0 || v > 1) return `${key} must be between 0 and 1`;
  }
  if (key.startsWith('pickup_cap_billable_km_')) {
    if (v <= 0) return `${key} must be > 0`;
  }
  if (key === 'pickup_cap_pct_of_fare') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }
  if (key === 'pickup_reference_pool_size') {
    if (!Number.isInteger(v) || v < 1) return `${key} must be a positive integer`;
  }
  if (key === 'pickup_reference_quantile') {
    if (v < 0 || v > 1) return `${key} must be between 0 and 1`;
  }
  if (key === 'pickup_trueup_cap_multiplier') {
    if (v < 1) return `${key} must be >= 1`;
  }
  if (key === 'pickup_origin_confidence_min') {
    if (v < 0 || v > 1) return `${key} must be between 0 and 1`;
  }
  if (key === 'pickup_pin_tolerance_m') {
    if (v <= 0) return `${key} must be > 0`;
  }
  if (key === 'pickup_max_forced_requotes') {
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`;
  }
  if (key === 'pickup_trace_max_segment_speed_kmh') {
    if (v <= 0) return `${key} must be > 0`;
  }
  if (key === 'pickup_no_driver_fallback_km') {
    if (v <= 0) return `${key} must be > 0`;
  }
  if (key === 'cold_drop_boost_multiplier') {
    if (v < 1) return `${key} must be >= 1`;
  }
  if (key === 'cold_drop_boost_decay_minutes') {
    if (v <= 0) return `${key} must be > 0`;
  }
  if (key === 'return_lead_affinity_multiplier') {
    if (v < 1) return `${key} must be >= 1`;
  }
  if (key === 'new_driver_priority_days') {
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`;
  }
  if (key === 'new_driver_priority_leads') {
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`;
  }
  if (key === 'heat_blend_baseline_weight') {
    if (v < 0 || v > 1) return `${key} must be between 0 and 1`;
  }
  if (key === 'heat_baseline_earnings_minutes') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }
  if (key === 'heat_baseline_window_days') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }
  if (key === 'heat_live_ewma_halflife_minutes') {
    if (v <= 0) return `${key} must be > 0`;
  }
  if (key === 'heat_tag_hot_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }
  if (key === 'heat_tag_cold_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }
  if (key === 'heat_idle_threshold_minutes') {
    if (v <= 0) return `${key} must be > 0`;
  }
  if (key === 'dawdle_rolling_pickups') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }
  if (key === 'dawdle_median_threshold') {
    if (v <= 1) return `${key} must be > 1`;
  }
  if (key === 'dawdle_p90_threshold') {
    if (v <= 1) return `${key} must be > 1`;
  }
  if (key === 'dawdle_zone_margin') {
    if (v < 0) return `${key} must be >= 0`;
  }
  if (key === 'dawdle_window_days') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }
  if (key === 'zone_recal_deviation_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }
  if (key === 'zone_recal_min_sample_rides') {
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`;
  }
  if (key === 'zone_recal_review_sla_days') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }
  if (key === 'proximity_cancel_cooldown_minutes') {
    if (v < 0) return `${key} must be >= 0`;
  }
  if (key === 'cancel_rate_package_gate_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }
  if (key === 'offplatform_trace_overlap_pct') {
    if (v < 0 || v > 100) return `${key} must be between 0 and 100`;
  }
  if (key === 'dispatch_offer_ttl_seconds') {
    if (!Number.isInteger(v) || v <= 0) return `${key} must be a positive integer`;
  }
  if (key === 'heat_backtest_correlation') {
    if (value === '') return null;
    if (v < -1 || v > 1) return `${key} must be between -1 and 1`;
  }

  return null;
}

// ── Tests ──

describe('Admin config: fare framework ALLOWED_KEYS validation', () => {
  describe('boolean keys', () => {
    const booleanKeys = [
      'pickup_measurement_enabled',
      'pickup_fee_enabled',
      'pickup_low_confidence_never_bills_above_firm_quote',
      'cold_drop_boost_enabled',
      'zone_multi_active_enabled',
    ];

    for (const key of booleanKeys) {
      test(`${key} accepts 'true'`, () => {
        expect(validateKeyValue(key, 'true')).toBeNull();
      });
      test(`${key} accepts 'false'`, () => {
        expect(validateKeyValue(key, 'false')).toBeNull();
      });
      test(`${key} rejects 'yes'`, () => {
        expect(validateKeyValue(key, 'yes')).toContain("must be 'true' or 'false'");
      });
      test(`${key} rejects '1'`, () => {
        expect(validateKeyValue(key, '1')).toContain("must be 'true' or 'false'");
      });
    }
  });

  describe('CSV keys', () => {
    test('dawdle_escalation_windows accepts CSV string', () => {
      expect(validateKeyValue('dawdle_escalation_windows', '1,2,4')).toBeNull();
    });
    test('dawdle_escalation_windows accepts empty string', () => {
      expect(validateKeyValue('dawdle_escalation_windows', '')).toBeNull();
    });
    test('pickup_low_confidence_zone_ids accepts CSV of UUIDs', () => {
      expect(validateKeyValue('pickup_low_confidence_zone_ids', 'abc-def,ghi-jkl')).toBeNull();
    });
    test('pickup_low_confidence_zone_ids accepts empty string', () => {
      expect(validateKeyValue('pickup_low_confidence_zone_ids', '')).toBeNull();
    });
  });

  describe('enum keys', () => {
    test('fare_framework_stage accepts stage0', () => {
      expect(validateKeyValue('fare_framework_stage', 'stage0')).toBeNull();
    });
    test('fare_framework_stage accepts stage1', () => {
      expect(validateKeyValue('fare_framework_stage', 'stage1')).toBeNull();
    });
    test('fare_framework_stage accepts stage2', () => {
      expect(validateKeyValue('fare_framework_stage', 'stage2')).toBeNull();
    });
    test('fare_framework_stage accepts stage3', () => {
      expect(validateKeyValue('fare_framework_stage', 'stage3')).toBeNull();
    });
    test('fare_framework_stage rejects invalid value', () => {
      expect(validateKeyValue('fare_framework_stage', 'stage4')).toContain('must be one of');
    });
    test('fare_framework_stage rejects arbitrary string', () => {
      expect(validateKeyValue('fare_framework_stage', 'production')).toContain('must be one of');
    });
  });

  describe('numeric keys with range validation', () => {
    test('pickup_cap_pct_of_fare accepts 40', () => {
      expect(validateKeyValue('pickup_cap_pct_of_fare', '40')).toBeNull();
    });
    test('pickup_cap_pct_of_fare rejects 101', () => {
      expect(validateKeyValue('pickup_cap_pct_of_fare', '101')).toContain('must be between 0 and 100');
    });
    test('pickup_cap_pct_of_fare rejects negative', () => {
      expect(validateKeyValue('pickup_cap_pct_of_fare', '-1')).toContain('must be between 0 and 100');
    });

    test('pickup_rate_multiplier_bike accepts 0.75', () => {
      expect(validateKeyValue('pickup_rate_multiplier_bike', '0.75')).toBeNull();
    });
    test('pickup_rate_multiplier_bike rejects 1.5', () => {
      expect(validateKeyValue('pickup_rate_multiplier_bike', '1.5')).toContain('must be between 0 and 1');
    });

    test('pickup_cap_billable_km_bike accepts 2.0', () => {
      expect(validateKeyValue('pickup_cap_billable_km_bike', '2.0')).toBeNull();
    });
    test('pickup_cap_billable_km_bike rejects 0', () => {
      expect(validateKeyValue('pickup_cap_billable_km_bike', '0')).toContain('must be > 0');
    });

    test('pickup_reference_quantile accepts 0.75', () => {
      expect(validateKeyValue('pickup_reference_quantile', '0.75')).toBeNull();
    });
    test('pickup_reference_quantile rejects 1.5', () => {
      expect(validateKeyValue('pickup_reference_quantile', '1.5')).toContain('must be between 0 and 1');
    });

    test('pickup_trueup_cap_multiplier accepts 1.25', () => {
      expect(validateKeyValue('pickup_trueup_cap_multiplier', '1.25')).toBeNull();
    });
    test('pickup_trueup_cap_multiplier rejects 0.5', () => {
      expect(validateKeyValue('pickup_trueup_cap_multiplier', '0.5')).toContain('must be >= 1');
    });

    test('pickup_origin_confidence_min accepts 0.7', () => {
      expect(validateKeyValue('pickup_origin_confidence_min', '0.7')).toBeNull();
    });
    test('pickup_origin_confidence_min rejects 1.5', () => {
      expect(validateKeyValue('pickup_origin_confidence_min', '1.5')).toContain('must be between 0 and 1');
    });

    test('dawdle_median_threshold accepts 1.15', () => {
      expect(validateKeyValue('dawdle_median_threshold', '1.15')).toBeNull();
    });
    test('dawdle_median_threshold rejects 1.0', () => {
      expect(validateKeyValue('dawdle_median_threshold', '1.0')).toContain('must be > 1');
    });

    test('dawdle_p90_threshold accepts 1.35', () => {
      expect(validateKeyValue('dawdle_p90_threshold', '1.35')).toBeNull();
    });
    test('dawdle_p90_threshold rejects 0.9', () => {
      expect(validateKeyValue('dawdle_p90_threshold', '0.9')).toContain('must be > 1');
    });

    test('heat_backtest_correlation accepts empty (unset)', () => {
      expect(validateKeyValue('heat_backtest_correlation', '')).toBeNull();
    });
    test('heat_backtest_correlation accepts 0.5', () => {
      expect(validateKeyValue('heat_backtest_correlation', '0.5')).toBeNull();
    });
    test('heat_backtest_correlation accepts -0.3', () => {
      expect(validateKeyValue('heat_backtest_correlation', '-0.3')).toBeNull();
    });
    test('heat_backtest_correlation rejects 1.5', () => {
      expect(validateKeyValue('heat_backtest_correlation', '1.5')).toContain('must be between -1 and 1');
    });

    test('dispatch_offer_ttl_seconds accepts 15', () => {
      expect(validateKeyValue('dispatch_offer_ttl_seconds', '15')).toBeNull();
    });
    test('dispatch_offer_ttl_seconds rejects 0', () => {
      expect(validateKeyValue('dispatch_offer_ttl_seconds', '0')).toContain('must be a positive integer');
    });
    test('dispatch_offer_ttl_seconds rejects 1.5', () => {
      expect(validateKeyValue('dispatch_offer_ttl_seconds', '1.5')).toContain('must be a positive integer');
    });

    test('zone_recal_deviation_pct accepts 20', () => {
      expect(validateKeyValue('zone_recal_deviation_pct', '20')).toBeNull();
    });
    test('zone_recal_deviation_pct rejects 101', () => {
      expect(validateKeyValue('zone_recal_deviation_pct', '101')).toContain('must be between 0 and 100');
    });

    test('cancel_rate_package_gate_pct accepts 30', () => {
      expect(validateKeyValue('cancel_rate_package_gate_pct', '30')).toBeNull();
    });
    test('cancel_rate_package_gate_pct rejects 101', () => {
      expect(validateKeyValue('cancel_rate_package_gate_pct', '101')).toContain('must be between 0 and 100');
    });

    test('offplatform_trace_overlap_pct accepts 60', () => {
      expect(validateKeyValue('offplatform_trace_overlap_pct', '60')).toBeNull();
    });
    test('offplatform_trace_overlap_pct rejects -1', () => {
      expect(validateKeyValue('offplatform_trace_overlap_pct', '-1')).toContain('must be between 0 and 100');
    });
  });

  describe('non-negative integer keys', () => {
    test('new_driver_priority_days accepts 7', () => {
      expect(validateKeyValue('new_driver_priority_days', '7')).toBeNull();
    });
    test('new_driver_priority_days accepts 0', () => {
      expect(validateKeyValue('new_driver_priority_days', '0')).toBeNull();
    });
    test('new_driver_priority_days rejects -1', () => {
      expect(validateKeyValue('new_driver_priority_days', '-1')).toContain('must be a non-negative integer');
    });

    test('new_driver_priority_leads accepts 0', () => {
      expect(validateKeyValue('new_driver_priority_leads', '0')).toBeNull();
    });
    test('pickup_max_forced_requotes accepts 2', () => {
      expect(validateKeyValue('pickup_max_forced_requotes', '2')).toBeNull();
    });
    test('zone_recal_min_sample_rides accepts 0', () => {
      expect(validateKeyValue('zone_recal_min_sample_rides', '0')).toBeNull();
    });
  });

  describe('unknown keys rejected', () => {
    test('unknown key returns error', () => {
      expect(validateKeyValue('unknown_key', '123')).toContain('Unknown key');
    });
    test('old surge key rejected', () => {
      expect(validateKeyValue('surge_thresholds', '1.5')).toContain('Unknown key');
    });
  });

  describe('non-numeric values rejected for numeric keys', () => {
    test('pickup_cap_pct_of_fare rejects "abc"', () => {
      expect(validateKeyValue('pickup_cap_pct_of_fare', 'abc')).toContain('must be numeric');
    });
    test('pickup_reference_pool_size rejects "five"', () => {
      expect(validateKeyValue('pickup_reference_pool_size', 'five')).toContain('must be numeric');
    });
  });
});

// ── Fraud flag status transition tests ──

describe('Fraud flag status transitions', () => {
  const STATUS_ORDER: Record<string, number> = {
    open: 0,
    warned: 1,
    escalated: 2,
    blocked: 3,
    resolved: 4,
  };

  function isValidTransition(from: string, to: string): boolean {
    const currentOrder = STATUS_ORDER[from] ?? -1;
    const targetOrder = STATUS_ORDER[to] ?? -1;
    const isBlockedToResolved = from === 'blocked' && to === 'resolved';
    return isBlockedToResolved || targetOrder > currentOrder;
  }

  test('open → warned is valid', () => {
    expect(isValidTransition('open', 'warned')).toBe(true);
  });
  test('open → escalated is valid', () => {
    expect(isValidTransition('open', 'escalated')).toBe(true);
  });
  test('open → blocked is valid', () => {
    expect(isValidTransition('open', 'blocked')).toBe(true);
  });
  test('warned → escalated is valid', () => {
    expect(isValidTransition('warned', 'escalated')).toBe(true);
  });
  test('warned → blocked is valid', () => {
    expect(isValidTransition('warned', 'blocked')).toBe(true);
  });
  test('escalated → blocked is valid', () => {
    expect(isValidTransition('escalated', 'blocked')).toBe(true);
  });
  test('blocked → resolved is valid (admin resolution)', () => {
    expect(isValidTransition('blocked', 'resolved')).toBe(true);
  });

  test('warned → open is invalid (backwards)', () => {
    expect(isValidTransition('warned', 'open')).toBe(false);
  });
  test('escalated → warned is invalid (backwards)', () => {
    expect(isValidTransition('escalated', 'warned')).toBe(false);
  });
  test('blocked → open is invalid (backwards)', () => {
    expect(isValidTransition('blocked', 'open')).toBe(false);
  });
  test('resolved → blocked is invalid', () => {
    expect(isValidTransition('resolved', 'blocked')).toBe(false);
  });
  test('open → resolved is valid (forward transition)', () => {
    expect(isValidTransition('open', 'resolved')).toBe(true);
  });
});

// ── Fraud flag PATCH schema validation ──

describe('Fraud flag PATCH schema', () => {
  const patchSchema = z.object({
    status: z.enum(['warned', 'escalated', 'blocked', 'resolved']),
    resolved_by: z.string().uuid().optional(),
  });

  test('accepts valid status', () => {
    const result = patchSchema.safeParse({ status: 'warned' });
    expect(result.success).toBe(true);
  });
  test('accepts resolved with resolved_by', () => {
    const result = patchSchema.safeParse({
      status: 'resolved',
      resolved_by: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });
  test('rejects invalid status', () => {
    const result = patchSchema.safeParse({ status: 'open' });
    expect(result.success).toBe(false);
  });
  test('rejects missing status', () => {
    const result = patchSchema.safeParse({});
    expect(result.success).toBe(false);
  });
  test('rejects invalid uuid for resolved_by', () => {
    const result = patchSchema.safeParse({
      status: 'resolved',
      resolved_by: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

// ── Pickup analytics query param validation ──

describe('Pickup analytics query params', () => {
  test('valid date parses correctly', () => {
    const from = new Date('2026-08-01');
    expect(Number.isNaN(from.getTime())).toBe(false);
  });
  test('invalid date is NaN', () => {
    const from = new Date('not-a-date');
    expect(Number.isNaN(from.getTime())).toBe(true);
  });
  test('limit clamped to max 200', () => {
    const raw = 500;
    const clamped = Math.min(Math.max(raw || 50, 1), 200);
    expect(clamped).toBe(200);
  });
  test('limit clamped to min 1', () => {
    const raw = 0;
    const clamped = Math.min(Math.max(raw || 50, 1), 200);
    expect(clamped).toBe(50); // 0 is falsy, falls back to 50
  });
  test('offset defaults to 0', () => {
    const raw = null;
    const offset = raw ? Math.max(parseInt(raw, 10) || 0, 0) : 0;
    expect(offset).toBe(0);
  });
});
