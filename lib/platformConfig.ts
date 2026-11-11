import { db } from '@/src/db';

import { platformConfig } from '@/src/db/schema';
import { inArray, eq, sql } from 'drizzle-orm';
import { logger } from './logger';

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
  // Hotspot map — zone_heat reading freshness window (minutes)
  'hotspot_freshness_minutes',
  // D9-2 (skeptic §D9): money-movement master switch. Default false —
  // priced package/topup/pass purchases 409 until month-3 payments launch.
  // ৳0 trial activation bypasses the gate (launch_free must keep working).
  'payments_enabled',
  'women_only_rides_enabled',
  'scooter_vehicle_type_enabled',
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
  hotspot_freshness_minutes: '10',         // zone_heat readings older than this are stale
  payments_enabled: 'false',               // D9-2: money movement OFF until payments launch
  women_only_rides_enabled: 'false',
  scooter_vehicle_type_enabled: 'false',
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
 * Convenience: parse a boolean config key (\"true\"/\"false\").
 */
export async function getPlan05Bool<K extends Plan05ConfigKey>(
  key: K,
): Promise<boolean> {
  const raw = await getPlan05Value(key);
  return raw.toLowerCase() === 'true';
}

/**
 * Read an admin-managed system_config JSON blob (e.g. sos_contacts) by key,
 * returning the parsed value or the fallback if the row is missing/unparseable.
 * Unlike platform_config, system_config is NOT a Plan 05 feature-gate table,
 * so this is deliberately generic (any key → any JSON) rather than typed to
 * PLAN05_CONFIG_KEYS.
 */
export async function getSystemConfig<T>(keys: string[]): Promise<Record<string, T>> {
  const rows = await db
    .select({ key: platformConfig.key, value: platformConfig.value })
    .from(platformConfig)
    .where(inArray(platformConfig.key, keys));

  const map = new Map(rows.map((r) => [r.key, r.value]));
  const result = {} as Record<string, T>;
  for (const key of keys) {
    const raw = map.get(key);
    if (!raw) {
      result[key] = undefined as unknown as T;
      continue;
    }
    try {
      result[key] = JSON.parse(raw) as T;
    } catch {
      result[key] = undefined as unknown as T;
    }
  }
  return result;
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
 * Node launch (DESIGN-NODE-LAUNCH.md Component A) — the single platform_config
 * key governing ride-vertical visibility. Seeded `true` by
 * scripts/seed-platform-config.js (fresh databases only); flipped exclusively
 * via PATCH /api/admin/config (owner-only, BOOLEAN_KEYS).
 */
export const RIDE_VERTICAL_ENABLED_KEY = 'ride_vertical_enabled';

/**
 * Thin wrapper over isVerticalEnabled — no new query path, no cache
 * (AGENTS.md: never cache platform_config). Fail-closed: a missing key AND a
 * DB error both read as ride hidden (isVerticalEnabled semantics), so any
 * database that missed the stage-1 seed renders ride hidden silently.
 */
export function isRideVerticalEnabled(): Promise<boolean> {
  return isVerticalEnabled(RIDE_VERTICAL_ENABLED_KEY);
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
 * Marketplace knobs (platform_config keys) — read fresh via getConfigInt /
 * getConfigValue at call time; admin-editable via PATCH /api/admin/config
 * (AGENTS.md: never cache platform_config).
 */
export const MARKETPLACE_CONFIG_KEYS = [
  // Shop→delivery bridge bidding window; default 600 (10 minutes).
  'food_delivery_bidding_window_seconds',
  // Launch surfaces (Amendment 3 D4) — delivery economics. Percentage the
  // platform takes from each delivered leg (0–100). Server computes courier
  // earnings from these; never the client.
  'delivery_commission_percent',
  // §12 (OWNER-DECISION 2026-10-12, refined): launch economics are SEEDS,
  // never code constants — every consumer fresh-reads these keys from
  // platform_config at request time, so an admin edit takes effect with no
  // deploy. Values live in scripts/seed-platform-config.js only.
  'delivery_fee_within_3km_bdt',   // customer-paid fee, integer paisa, within the tier radius
  'delivery_fee_beyond_3km_bdt',   // customer-paid fee, integer paisa, beyond the tier radius
  'delivery_fee_tier_radius_km',   // distance (km) separating the two fee tiers
  'delivery_man_subscription_bdt_monthly', // delivery-man subscription, integer paisa/month
  'shop_commission_percent',       // marketplace commission on shop revenue (a percentage; zero at launch)
  // S4/F-11: customer cancel fee after the shop accepts — integer paisa,
  // state-dependent (0 while pending); launch seed 0, admin can raise it.
  'shop_order_cancel_fee_after_accept_bdt',
  // S5 (plan 27 §4/F-17) — fleet payout split owner ↔ driver. Percentage of
  // the driver-fare pool the FLEET OWNER keeps; launch seed 0 = 100% driver
  // (owner ruling: default 100% driver unless ruled otherwise). Integer 0–100;
  // fresh-read server-side, never a code literal.
  'fleet_owner_share_percent',
  // S5 (F-22) — vehicle doc expiry: warn the fleet at T-days before
  // fitness/tax-token expiry (launch seed 30). Offers BLOCK at expiry — the
  // block is a date comparison in dispatch eligibility, never this key.
  'vehicle_doc_expiry_warning_days',
  // S5 (F-19) — ambulance ack timeout: silence beyond this many seconds
  // escalates (seed 60 — the F-19 revision's 60s, config-driven per the order).
  'emergency_ack_timeout_seconds',
  // S5 (F-19) — escalation re-broadcast ring: the widened H3 ring tier used
  // when the ack timeout escalates (seed 50; base broadcast uses
  // emergency_broadcast_k_ring = 25).
  'emergency_escalation_k_ring',
  // S6 (plan 27 §6.1) — sequential delivery dispatch. The offer window is how
  // long ONE candidate has to respond before the chain moves to the next
  // (seed 45 seconds — the §6.1 45s window); max suggestions caps the chain
  // per leg (seed 3 — the §6.1 3 suggestions). Seeds, never constants.
  'delivery_offer_window_seconds',
  'delivery_max_suggestions',
  // S6 (plan 27 §12 + F-33) — COD remittance dues: overdue after this many
  // days past delivery (seed 7); dispatch hold applies when a courier's
  // overdue total exceeds this amount (seed 0 paisa = any overdue due holds).
  'cod_remittance_overdue_days',
  'cod_dispatch_hold_threshold_bdt',
  // delivery_fee_default_bdt was DROPPED (§12): superseded by the distance
  // tier above. It had no consumer on disk; the row it seeded is inert.
] as const;

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

// ══════════════════════════════════════════════════════════════════════
// REVENUE MODEL — subscription vs commission vs hybrid
// ══════════════════════════════════════════════════════════════════════

/**
 * `revenue_model` platform_config values (fresh-read, never cached):
 *   - subscription_only: kill-switch OFF — legacy prepaid behavior (the default)
 *   - hybrid:            kill-switch ON — per-driver possession governs
 * `commission_only` is removed from the allowed set (Stage 1); unknown values
 * default to subscription_only so the degraded contract is checked, not assumed.
 */
export type RevenueModel = 'subscription_only' | 'hybrid';

/** Safe default — preserves the pre-commission dispatch behavior until toggled. */
export const REVENUE_MODEL_DEFAULT: RevenueModel = 'subscription_only';

/** ৳500 in integer paisa — default commission-debt ceiling before dispatch lockout. */
export const MAX_COMMISSION_DEBT_DEFAULT_PAISA = 50_000;

export function parseRevenueModel(raw: string | null | undefined): RevenueModel {
  return raw === 'subscription_only' || raw === 'hybrid' ? raw : REVENUE_MODEL_DEFAULT;
}

/** Fresh-read the global revenue model (AGENTS.md: never cache platform_config). */
export async function getRevenueModel(): Promise<RevenueModel> {
  return parseRevenueModel(await getConfigValue('revenue_model', REVENUE_MODEL_DEFAULT));
}

/** Fresh-read the commission-debt ceiling in integer paisa. */
export async function getMaxCommissionDebtBdt(): Promise<number> {
  return getConfigInt('max_commission_debt_bdt', MAX_COMMISSION_DEBT_DEFAULT_PAISA);
}

// ══════════════════════════════════════════════════════════════════════
// PER-OPERATOR-ROLE DEBT CEILINGS (Batch-2 Item 5)
// ══════════════════════════════════════════════════════════════════════

/**
 * Batch-2 Item 5: per-operator-role debt ceiling keys (integer paisa).
 * 'driver' keeps the existing max_commission_debt_bdt key; the shop/delivery/
 * fleet defaults mirror the driver default (৳500) — no invented sizing; admin
 * raises fleet's as needed. Consumers fresh-read via getDebtCeilingForRole
 * (AGENTS.md: never cache platform_config).
 */
export const DEBT_CEILING_KEYS_BY_ROLE: Record<string, string> = {
  driver: 'max_commission_debt_bdt',
  shop: 'max_debt_ceiling_shop_bdt',
  delivery: 'max_debt_ceiling_delivery_bdt',
  fleet: 'max_debt_ceiling_fleet_bdt',
};

/** DB tx handle type. */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Any drizzle query executor: the pool, or a caller's transaction. */
export type PlatformConfigExecutor = DbTx | typeof db;

/**
 * Batch-2 Item 5: fresh-read the debt ceiling for an operator role in integer
 * paisa. Unknown roles fall back to the driver key (safe default). Fresh read,
 * never cached.
 *
 * The optional executor lets Items 8-10's hooks read the ceiling inside the
 * same transaction as their money write (never a cached figure).
 */
export async function getDebtCeilingForRole(
  operatorRole: string,
  executor?: PlatformConfigExecutor,
): Promise<number> {
  const key = DEBT_CEILING_KEYS_BY_ROLE[operatorRole] ?? 'max_commission_debt_bdt';
  if (!executor) return getConfigInt(key, MAX_COMMISSION_DEBT_DEFAULT_PAISA);

  const [row] = await executor.execute(
    sql`SELECT value FROM platform_config WHERE key = ${key} LIMIT 1`,
  );
  const parsed = parseInt(String((row as { value?: unknown } | undefined)?.value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : MAX_COMMISSION_DEBT_DEFAULT_PAISA;
}

/**
 * Read a platform_config integer that MUST exist in the DB — for the §12
 * economics keys, whose values are seeded by scripts/seed-platform-config.js
 * and are never duplicated as a code literal (the stage-order
 * \"seeds, not constants\" rule).
 *
 * A missing/unreadable key is a deployment defect, not a silent zero: it logs
 * loudly and throws so the request fails instead of pricing a delivery off an
 * invented number.
 */
export async function requireConfigInt(key: string): Promise<number> {
  const rows = await db
    .select({ value: platformConfig.value })
    .from(platformConfig)
    .where(eq(platformConfig.key, key))
    .limit(1);

  const raw = rows[0]?.value;
  const n = raw === undefined ? NaN : parseInt(raw, 10);
  if (raw === undefined || !Number.isFinite(n)) {
    logger.error('[platformConfig] required key missing or not numeric', { key, value: raw ?? null });
    throw Object.assign(new Error(`Missing platform_config key: ${key}`), { status: 500 });
  }
  return n;
}
