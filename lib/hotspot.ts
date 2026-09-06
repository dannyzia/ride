/**
 * Hotspot detection — advisory only.
 *
 * Resolves the hotspot tier (low/medium/high) for a coordinate from the
 * existing `zone_heat` table (Fare Framework v1). The detection functions in
 * this module are READ-ONLY: tier assignment writes to zone_heat live in the
 * heat engine (utils-server/scheduler.ts) and the admin CRUD
 * (app/api/admin/hotspots+api.ts). Nothing here touches dispatch ordering.
 *
 * Design (per the approved plan):
 *  - Zone containment via the existing multi-zone polygon resolver
 *    (lib/zone.ts getZoneForLocation) — zones in this codebase are polygons,
 *    not bare H3 cells; the H3 res-8 cell of the query point keys the
 *    in-process cache so repeated markers/readings in the same ~740m hex
 *    hit the DB once.
 *  - 3-beat hysteresis: a moving user's zone attachment only flips after
 *    HYSTERESIS_BEATS consecutive same-zone readings, never on a single
 *    sample. Flips are additionally rate-limited to one per refresh window.
 *  - Freshness: a zone_heat reading is trusted only within the
 *    `hotspot_freshness_minutes` window (default 10). Fallback: the most
 *    recent fresh zone_heat reading across zones; if none, null.
 */
import { db } from '@/src/db';
import { zoneHeat, zones } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getZoneForLocation } from '@/lib/zone';
import { getH3CellRes8 } from '@/lib/h3';
import { getPlan05Int } from '@/lib/platformConfig';
import { logger } from '@/lib/logger';

export type HotspotTier = 'low' | 'medium' | 'high';
export type ZoneHeatTag = 'hot' | 'neutral' | 'cold';

/** Default trust window for a zone_heat reading, minutes. */
export const DEFAULT_FRESHNESS_MINUTES = 10;
/** Consecutive same-zone readings required before the stable zone flips. */
export const HYSTERESIS_BEATS = 3;
/** Minimum time between stable-zone flips (the "refresh window"). */
export const REFRESH_WINDOW_MS = 10 * 60 * 1000;

/** zone_heat tag → rider-facing tier. */
export function tierFromTag(tag: ZoneHeatTag): HotspotTier {
  if (tag === 'hot') return 'high';
  if (tag === 'neutral') return 'medium';
  return 'low';
}

/** Rider-facing tier → zone_heat tag (admin CRUD storage mapping). */
export function tagFromTier(tier: HotspotTier): ZoneHeatTag {
  if (tier === 'high') return 'hot';
  if (tier === 'medium') return 'neutral';
  return 'cold';
}

/** True when the zone_heat reading is still inside the trust window. */
export function isReadingFresh(
  computedAt: Date | string,
  now: Date,
  windowMinutes: number = DEFAULT_FRESHNESS_MINUTES,
): boolean {
  const computed = computedAt instanceof Date ? computedAt : new Date(computedAt);
  if (Number.isNaN(computed.getTime())) return false;
  return now.getTime() - computed.getTime() <= windowMinutes * 60_000;
}

// ── 3-beat hysteresis state machine (pure) ─────────────────────────────

export interface HysteresisState {
  stableZoneId: string | null;
  candidateZoneId: string | null;
  beats: number;
  /** Timestamp of the last stable-zone flip (rate-limits further flips). */
  lastFlipMs: number | null;
}

export function initialHysteresisState(): HysteresisState {
  return { stableZoneId: null, candidateZoneId: null, beats: 0, lastFlipMs: null };
}

/**
 * Feed one zone reading through the hysteresis state machine.
 *
 *  - null reading (outside every zone) resets the candidate streak but keeps
 *    the stable attachment.
 *  - A candidate zone needs HYSTERESIS_BEATS consecutive readings to become
 *    stable, and flips are rate-limited to one per refresh window — beats
 *    keep accumulating while blocked and apply at the next refresh.
 *
 * Returns the stable zone id plus the advanced state (caller persists it —
 * the function itself is pure).
 */
export function applyHysteresis(
  state: HysteresisState,
  reading: string | null,
  nowMs: number,
  opts?: { beats?: number; refreshWindowMs?: number },
): { zoneId: string | null; state: HysteresisState } {
  const beatsNeeded = opts?.beats ?? HYSTERESIS_BEATS;
  const windowMs = opts?.refreshWindowMs ?? REFRESH_WINDOW_MS;
  const next: HysteresisState = { ...state };

  if (reading === null) {
    next.candidateZoneId = null;
    next.beats = 0;
    return { zoneId: next.stableZoneId, state: next };
  }

  if (reading === next.stableZoneId) {
    // Back in sync with the stable attachment — reset the streak.
    next.candidateZoneId = null;
    next.beats = 0;
    return { zoneId: next.stableZoneId, state: next };
  }

  if (reading === next.candidateZoneId) {
    next.beats += 1;
  } else {
    next.candidateZoneId = reading;
    next.beats = 1;
  }

  const streakComplete = next.beats >= beatsNeeded;
  const windowElapsed =
    next.lastFlipMs === null || nowMs - next.lastFlipMs >= windowMs;
  if (streakComplete && windowElapsed) {
    next.stableZoneId = reading;
    next.candidateZoneId = null;
    next.beats = 0;
    next.lastFlipMs = nowMs;
  }

  return { zoneId: next.stableZoneId, state: next };
}

// ── DB resolver ────────────────────────────────────────────────────────

export interface HotspotZone {
  zone_id: string;
  zone_name: string;
  tier: HotspotTier;
  tag: ZoneHeatTag;
  score: number;
  computed_at: Date;
}

interface CellCacheEntry {
  expiresAtMs: number;
  zone: HotspotZone | null;
}

const cellCache = new Map<string, CellCacheEntry>();

/** Invalidate the hotspot cell cache (call after admin tier writes). */
export function clearHotspotCache(): void {
  cellCache.clear();
}

function rowToHotspotZone(row: {
  zone_id: string;
  name: string;
  tag: ZoneHeatTag;
  score: string;
  computed_at: Date;
}): HotspotZone {
  return {
    zone_id: row.zone_id,
    zone_name: row.name,
    tier: tierFromTag(row.tag),
    tag: row.tag,
    score: Number(row.score),
    computed_at: row.computed_at,
  };
}

async function fetchFreshZoneForZone(
  zoneId: string,
  now: Date,
  windowMinutes: number,
): Promise<HotspotZone | null> {
  const [row] = await db
    .select({
      zone_id: zoneHeat.zone_id,
      name: zones.name,
      tag: zoneHeat.tag,
      score: zoneHeat.score,
      computed_at: zoneHeat.computed_at,
    })
    .from(zoneHeat)
    .innerJoin(zones, eq(zoneHeat.zone_id, zones.id))
    .where(eq(zoneHeat.zone_id, zoneId))
    .limit(1);
  if (!row) return null;
  if (!isReadingFresh(row.computed_at, now, windowMinutes)) return null;
  return rowToHotspotZone(row);
}

async function fetchMostRecentFreshZone(
  now: Date,
  windowMinutes: number,
): Promise<HotspotZone | null> {
  const rows = await db
    .select({
      zone_id: zoneHeat.zone_id,
      name: zones.name,
      tag: zoneHeat.tag,
      score: zoneHeat.score,
      computed_at: zoneHeat.computed_at,
    })
    .from(zoneHeat)
    .innerJoin(zones, eq(zoneHeat.zone_id, zones.id))
    .orderBy(desc(zoneHeat.computed_at))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!isReadingFresh(row.computed_at, now, windowMinutes)) return null;
  return rowToHotspotZone(row);
}

export interface GetHotspotZoneOptions {
  now?: Date;
  /** Overrides the `hotspot_freshness_minutes` platform_config read (tests). */
  freshnessMinutes?: number;
  /** Bypass the in-process cell cache (tests, admin refresh). */
  noCache?: boolean;
  /**
   * When true, skip the any-zone fallback: only a zone actually containing
   * the point with a fresh heat reading resolves. Used for per-marker
   * tiering where mislabeling a far-away marker with the globally freshest
   * zone would be wrong.
   */
  strict?: boolean;
}

/**
 * Resolve the hotspot zone/tier for a coordinate, or null when the point is
 * outside every zone AND no fresh zone_heat reading exists anywhere.
 *
 * Pure read path — no DB writes. Reads are cached per H3 res-8 cell for the
 * freshness window so marker fan-out costs at most one query per hex.
 */
export async function getHotspotZone(
  lat: number,
  lng: number,
  opts: GetHotspotZoneOptions = {},
): Promise<HotspotZone | null> {
  const now = opts.now ?? new Date();
  const windowMinutes =
    opts.freshnessMinutes ??
    (await getPlan05Int('hotspot_freshness_minutes', DEFAULT_FRESHNESS_MINUTES));

  const cell = getH3CellRes8(lat, lng);
  if (!opts.noCache) {
    const cached = cellCache.get(cell);
    if (cached && now.getTime() < cached.expiresAtMs) {
      return cached.zone;
    }
  }

  let zone: HotspotZone | null = null;
  try {
    const resolved = await getZoneForLocation(lat, lng);
    if (resolved.valid && resolved.zone) {
      zone = await fetchFreshZoneForZone(resolved.zone.id, now, windowMinutes);
    }
    if (!zone && !opts.strict) {
      // Fallback: most recent reading within the window, any zone.
      zone = await fetchMostRecentFreshZone(now, windowMinutes);
    }
  } catch (err: unknown) {
    logger.error('[hotspot] zone resolution failed', {
      lat,
      lng,
      error: err instanceof Error ? err.message : String(err),
    });
    zone = null;
  }

  if (!opts.noCache) {
    cellCache.set(cell, {
      expiresAtMs: now.getTime() + windowMinutes * 60_000,
      zone,
    });
  }
  return zone;
}
