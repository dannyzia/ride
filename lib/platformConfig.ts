import { db } from '@/src/db';
import { platformConfig } from '@/src/db/schema';
import { inArray } from 'drizzle-orm';

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
};

/**
 * Batch-fetch multiple platform_config keys in one query.
 * Returns an object keyed by config key, with the DB value or the
 * built-in default if the row is missing.
 *
 * Usage:
 *   const cfg = await getPlan05Config(['sos_cooldown_seconds', 'schedule_min_lead_minutes']);
 *   const cooldownMs = cfg.sos_cooldown_seconds * 1000;
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
 * Prefer the batch `getPlan05Config` when reading 2+ keys.
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
 * Admin toggles zone_multi_active_enabled to gate the Zone Foundation.
 */
export async function getPlan05Bool<K extends Plan05ConfigKey>(
  key: K,
): Promise<boolean> {
  const raw = await getPlan05Value(key);
  return raw.toLowerCase() === 'true';
}
