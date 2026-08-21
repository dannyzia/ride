import { db } from '../src/db';
import { zones, platformConfig } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';
import { normalizePolygon, pointInPolygon, type LatLng } from './polygon';

export interface Zone {
  id: string;
  name: string;
  polygon: LatLng[];
  is_active: boolean;
}

let cachedZone: Zone | null = null;
let cachedZones: Zone[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Z-2/Z-3: No more fallback/sentinel polygons. When no valid zone exists,
 * return null — callers must handle 503 zones_not_configured.
 * The Bangladesh fallback and nil-UUID sentinel writes are removed.
 */
export async function getActiveZone(): Promise<Zone | null> {
  if (Date.now() < cacheExpiry && cachedZone) return cachedZone;

  const [row] = await db.select()
    .from(zones)
    .where(eq(zones.is_active, true))
    .limit(1);

  if (!row) {
    logger.warn('[zone] no active zone configured — returning null');
    cachedZone = null;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return null;
  }

  const polygon = normalizePolygon(row.polygon);

  if (!polygon || polygon.length < 3) {
    logger.warn('[zone] active zone has invalid polygon — skipping', {
      zoneId: row.id,
      zoneName: row.name,
      rawPolygonType: typeof row.polygon,
      rawPolygonLength: Array.isArray(row.polygon) ? row.polygon.length : 'not-array',
    });
    cachedZone = null;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return null;
  }

  cachedZone = {
    id: row.id,
    name: row.name,
    polygon,
    is_active: row.is_active,
  };

  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedZone;
}

export function isInsideZone(lat: number, lng: number, polygon: LatLng[]): boolean {
  return pointInPolygon(lat, lng, polygon);
}

/**
 * Z-2/Z-3: multi-zone resolver. When zone_multi_active_enabled is true,
 * loads ALL active zones and returns the one containing the point (smallest
 * polygon first, to handle overlapping zones). When false, falls back to
 * the single-zone getActiveZone().
 *
 * Returns 503 zones_not_configured when zero zones exist;
 * 422 outside_zone when the point is outside every zone.
 */
export async function getZoneForLocation(
  lat: number,
  lng: number,
): Promise<{ valid: boolean; zone?: Zone; error?: string }> {
  // Fresh read — never cached (AGENTS.md: platform_config)
  const [flagRow] = await db
    .select({ value: platformConfig.value })
    .from(platformConfig)
    .where(eq(platformConfig.key, 'zone_multi_active_enabled'))
    .limit(1);
  const multiActive = flagRow?.value?.toLowerCase() === 'true';

  if (!multiActive) {
    // Single-zone path (existing behavior)
    const zone = await getActiveZone();
    if (!zone) return { valid: true };
    const inside = isInsideZone(lat, lng, zone.polygon);
    if (!inside) {
      logger.info('[zone] pickup outside zone polygon', { lat, lng, zoneName: zone.name, zoneId: zone.id });
    }
    return { valid: inside, zone };
  }

  // Multi-zone path: load all active zones, check smallest first
  const allZones = await getActiveZones();
  if (allZones.length === 0) {
    logger.warn('[zone] no active zones configured (multi-active enabled)');
    return { valid: false, error: 'zones_not_configured' };
  }

  // Sort by polygon area (smallest first) so overlapping zones resolve correctly
  const sorted = [...allZones].sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon));
  for (const zone of sorted) {
    if (isInsideZone(lat, lng, zone.polygon)) {
      return { valid: true, zone };
    }
  }

  logger.info('[zone] pickup outside all active zones', { lat, lng, zoneCount: allZones.length });
  return { valid: false, error: 'outside_zone' };
}

/**
 * Z-5: invalidate all zone caches. Called by admin API after zone create/update/delete
 * so the next request picks up the new configuration.
 */
export function invalidateZoneCache(): void {
  cachedZone = null;
  cachedZones = null;
  cacheExpiry = 0;
  logger.info('[zone] cache invalidated');
}

/** Approximate polygon area in squared degrees (good enough for sort ordering). */
function polygonArea(pts: LatLng[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].lng * pts[j].lat;
    area -= pts[j].lng * pts[i].lat;
  }
  return Math.abs(area) / 2;
}

/** Cache all active zones (TTL same as single-zone cache). */
async function getActiveZones(): Promise<Zone[]> {
  if (Date.now() < cacheExpiry && cachedZones) return cachedZones;

  const rows = await db.select().from(zones).where(eq(zones.is_active, true));
  const result: Zone[] = [];
  for (const row of rows) {
    const polygon = normalizePolygon(row.polygon);
    if (polygon && polygon.length >= 3) {
      result.push({ id: row.id, name: row.name, polygon, is_active: row.is_active });
    } else {
      logger.warn('[zone] skipping zone with invalid polygon', { zoneId: row.id, zoneName: row.name });
    }
  }

  cachedZones = result;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return result;
}

/**
 * Validate a pickup location against the active zone(s).
 * Delegates to getZoneForLocation when multi-active is enabled,
 * falls back to getActiveZone() for single-zone mode.
 */
export async function validatePickupZone(
  lat: number,
  lng: number,
): Promise<{ valid: boolean; zone?: Zone; error?: string }> {
  const result = await getZoneForLocation(lat, lng);
  return { valid: result.valid, zone: result.zone, error: result.error };
}
