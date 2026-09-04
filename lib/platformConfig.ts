import { db } from '@/src/db';
import { platformConfig } from '@/src/db/schema';
import { inArray, eq } from 'drizzle-orm';

/**
 * Plan 05 feature-gate keys in platform_config.
 * All reads are fresh (AGENTS.md: never cache platform_config).
 * Admin changes via PATCH /api/admin/config must take effect without restart.
 */
export const PLAN05_CONFIG_KEYS = [
  // SOS
  'sos_cooldown_seconds',
  'sos_auto_resolve_seconds',
  // Scheduling
  'schedule_min_lead_minutes',
  'schedule_max_lead_days',
  // Cancellation
  'cancel_grace_period_seconds',
  // Zone Foundation
  'zone_multi_active_enabled',
  // R3.3: Auto-redispatch on driver cancel
  'auto_redispatch_enabled',
  'auto_redispatch_checkin_minutes',
  'auto_redispatch_delay_ms',
  'auto_redispatch_max_attempts',
] as const;

export type Plan05ConfigKey = (typeof PLAN05_CONFIG_KEYS)[number];

/** Default values matching the master plan spec. */
const DEFAULTS: Record<Plan05ConfigKey, string> = {
  sos_cooldown_seconds: '900',           // 15 minutes
  sos_auto_resolve_seconds: '1800',     // 30 minutes
  schedule_min_lead_minutes: '30',      // 30 minutes
  schedule_max_lead_days: '7',          // 7 days
  cancel_grace_period_seconds: '120',   // 2 minutes
  zone_multi_active_enabled: 'false',   // disabled until Zone Gate
  auto_redispatch_enabled: 'false',        // disabled until R3.3 is verified
  auto_redispatch_checkin_minutes: '3',    // 3 minutes before rider check-in
  auto_redispatch_delay_ms: '15000',       // 15s delay before first re-dispatch
  auto_redispatch_max_attempts: '3',       // give up (expired) after N redispatch attempts
};

/**
 * Batch-fetch multiple platform_config keys in one query.
 * Returns an object keyed by config key, with the DB value or the
 * built-in default if the row is missing.
 */
export async function getPlan05Config<K extends Plan05ConfigKey>(
  keys: K[],
): Promise<Record<K, string>> {
  const rows = await db
    .select({ key: platformConfig.key, value: platformConfig.value })
    .from(platformConfig)
    .where(inArray(platformConfig.key, keys));

  const map = new Map(rows.map((r) => [r.key, r.value]));
  const result = {} as Record<K, string>;
  for (const key of keys) {
    result[key] = map.get(key) ?? DEFAULTS[key];
  }
  return result;
}

/**
 * Fetch a single platform_config key with a typed default.
 */
export async function getPlan05Value<K extends Plan05ConfigKey>(
  key: K,
): Promise<string> {
  const cfg = await getPlan05Config([key]);
  return cfg[key];
}

/**
 * Convenience: parse a numeric config key to integer.
 * Returns the fallback if the value is missing or not a valid number.
 */
export async function getPlan05Int<K extends Plan05ConfigKey>(
  key: K,
  fallback?: number,
): Promise<number> {
  const raw = await getPlan05Value(key);
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : (fallback ?? parseInt(DEFAULTS[key], 10));
}

/**
 * Convenience: parse a boolean config key ("true"/"false").
 */
export async function getPlan05Bool<K extends Plan05ConfigKey>(
  key: K,
): Promise<boolean> {
  const raw = await getPlan05Value(key);
  return raw.toLowerCase() === 'true';
}

// ══════════════════════════════════════════════════════════════════════
// MARKETPLACE — generic vertical helpers
// ══════════════════════════════════════════════════════════════════════

/**
 * Check if a marketplace vertical is enabled.
 * Falls back to `false` when the key is absent from platform_config.
 */
export async function isVerticalEnabled(key: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, key))
      .limit(1);

    const val = rows[0]?.value;
    if (!val) return false;
    return val === 'true' || val === '1';
  } catch {
    return false;
  }
}

/**
 * Read a platform_config value, returning the fallback if absent.
 */
export async function getConfigValue(
  key: string,
  fallback: string,
): Promise<string> {
  try {
    const rows = await db
      .select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, key))
      .limit(1);

    return rows[0]?.value ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Read a platform_config value as integer, returning the fallback if absent/NaN.
 */
export async function getConfigInt(
  key: string,
  fallback: number,
): Promise<number> {
  const raw = await getConfigValue(key, String(fallback));
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}
