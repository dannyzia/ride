/**
 * Cold-drop boost cache — Framework Lever 2/3 support (Phase D ordering).
 *
 * Tracks each driver's most recent COLD drop (last completed ride whose
 * drop_zone_heat='cold') inside the decay window. Feeds:
 *  - Lever 2 cold-drop rank boost: score ×= multiplier × (1 − elapsed/decay)
 *  - Lever 3 return-lead affinity: pickup zone == recent cold drop zone
 *
 * In-memory Map with the TD-15 DB-rebuild-on-miss pattern: cache hits are
 * served from the Map (refreshed by recordColdDrop on ride completion);
 * misses are rebuilt with ONE indexed batched query per pool build. No
 * negative caching — a completion that happened after the last pool build is
 * picked up on the next dispatch. Levers are suggestive (§4): the decaying
 * boost is clamped at ≥ 1 so it can never become a penalty.
 */

import { db } from '../src/db';
import { rides } from '../src/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { logger } from '../lib/logger';
import {
  getFareFrameworkConfig,
  parseConfigBool,
  parseConfigNumber,
} from '../lib/fareFrameworkConfig';

export interface ColdDropInfo {
  /** Zone of the driver's most recent cold drop (null = outside all zones). */
  zoneId: string | null;
  /** Score multiplier ≥ 1 — never a penalty (levers are suggestive, §4). */
  boostMultiplier: number;
}

interface CacheEntry {
  zoneId: string | null;
  completedAtMs: number;
}

const coldDropCache = new Map<string, CacheEntry>();

interface ColdDropConfig {
  enabled: boolean;
  multiplier: number;
  decayMinutes: number;
}

async function loadColdDropConfig(): Promise<ColdDropConfig> {
  const cfg = await getFareFrameworkConfig([
    'cold_drop_boost_enabled',
    'cold_drop_boost_multiplier',
    'cold_drop_boost_decay_minutes',
  ]);
  return {
    enabled: parseConfigBool(cfg.cold_drop_boost_enabled),
    multiplier: parseConfigNumber(cfg.cold_drop_boost_multiplier, 1.2),
    decayMinutes: parseConfigNumber(cfg.cold_drop_boost_decay_minutes, 15),
  };
}

/** Decaying multiplier for a cache entry under the given config. */
function boostFor(entry: CacheEntry, cfg: ColdDropConfig): number {
  const elapsedMin = (Date.now() - entry.completedAtMs) / 60_000;
  if (elapsedMin >= cfg.decayMinutes) return 1;
  const raw = cfg.multiplier * (1 - elapsedMin / cfg.decayMinutes);
  // Clamp to [1, multiplier]: a decaying boost must never drop below 1 and
  // become a ranking penalty (§4 — no penalty for ignoring heat signals).
  return Math.max(1, Math.min(cfg.multiplier, raw));
}

/**
 * Refresh the cache when utils-server learns a ride completed with a cold
 * drop (called from the /internal/ride/completed hook in index.ts).
 */
export function recordColdDrop(
  driverId: string,
  completedAt: Date,
  zoneId: string | null,
): void {
  coldDropCache.set(driverId, {
    zoneId,
    completedAtMs: completedAt.getTime(),
  });
}

/** Test helper — wipe the in-memory cache. */
export function clearColdDropCache(): void {
  coldDropCache.clear();
}

/**
 * Batched lookup for the dispatch pool: one indexed DB query (DISTINCT ON
 * driver, most recent first) for all drivers not already cached. Returns a
 * Map keyed by driverId; drivers with no cold drop inside the decay window
 * are absent (no boost, no affinity). Empty when the lever is disabled.
 */
export async function getColdDropInfos(
  driverIds: string[],
): Promise<Map<string, ColdDropInfo>> {
  const result = new Map<string, ColdDropInfo>();
  if (driverIds.length === 0) return result;

  const cfg = await loadColdDropConfig();
  if (!cfg.enabled) return result;

  const decayMs = cfg.decayMinutes * 60_000;
  const now = Date.now();
  const missing: string[] = [];

  for (const driverId of driverIds) {
    const entry = coldDropCache.get(driverId);
    if (entry && now - entry.completedAtMs < decayMs) {
      result.set(driverId, {
        zoneId: entry.zoneId,
        boostMultiplier: boostFor(entry, cfg),
      });
    } else {
      if (entry) coldDropCache.delete(driverId); // decayed out of the window
      missing.push(driverId);
    }
  }

  if (missing.length === 0) return result;

  // DB-miss rebuild — always-fresh via the indexed query, one round-trip for
  // the whole batch. Fail-open: on DB error no driver gets a boost.
  try {
    const rows = await db.execute<{
      driver_id: string;
      drop_zone_id: string | null;
      completed_at: Date;
    }>(sql`
      SELECT DISTINCT ON (driver_id) driver_id, drop_zone_id, completed_at
      FROM rides
      WHERE driver_id IN ${missing}
        AND status = 'completed'
        AND drop_zone_heat = 'cold'
        AND completed_at > now() - (${cfg.decayMinutes} * interval '1 minute')
      ORDER BY driver_id, completed_at DESC
    `);
    for (const row of rows) {
      if (!row.driver_id || !row.completed_at) continue;
      const entry: CacheEntry = {
        zoneId: row.drop_zone_id,
        completedAtMs: new Date(row.completed_at).getTime(),
      };
      coldDropCache.set(row.driver_id, entry);
      result.set(row.driver_id, {
        zoneId: entry.zoneId,
        boostMultiplier: boostFor(entry, cfg),
      });
    }
  } catch (e: unknown) {
    logger.warn('[coldDrop] DB rebuild failed — failing open (no boost)', {
      error: (e as Error).message,
      driverCount: missing.length,
    });
  }

  return result;
}

/**
 * Single-driver convenience: the cold-drop boost multiplier, or 1 when the
 * driver has no cold drop in the window or the lever is disabled.
 */
export async function getColdDropBoost(driverId: string): Promise<number> {
  const infos = await getColdDropInfos([driverId]);
  return infos.get(driverId)?.boostMultiplier ?? 1;
}
