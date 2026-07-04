import { db } from '../src/db';
import { zones } from '../src/db/schema';
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
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

export async function getActiveZone(): Promise<Zone | null> {
  if (Date.now() < cacheExpiry && cachedZone) return cachedZone;

  const [row] = await db.select()
    .from(zones)
    .where(eq(zones.is_active, true))
    .limit(1);

  if (!row) {
    logger.warn('[zone] no active zone configured — fail-open');
    cachedZone = null;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return null;
  }

  cachedZone = {
    id: row.id,
    name: row.name,
    // The polygon column is jsonb and may be stored as GeoJSON
    // ({type:"Polygon",coordinates:[[[lng,lat]]]}) or as {lat,lng}[].
    // normalizePolygon() collapses both into a flat {lat,lng}[] ring.
    // Without this, a GeoJSON polygon slipped through `as {lat,lng}[]`
    // and isInsideZone returned false for EVERY point.
    polygon: normalizePolygon(row.polygon),
    is_active: row.is_active,
  };
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedZone;
}

export function isInsideZone(lat: number, lng: number, polygon: LatLng[]): boolean {
  return pointInPolygon(lat, lng, polygon);
}

export async function validatePickupZone(lat: number, lng: number): Promise<{ valid: boolean; zone?: Zone }> {
  const zone = await getActiveZone();
  if (!zone) return { valid: true };
  return { valid: isInsideZone(lat, lng, zone.polygon), zone };
}
