import { db } from '../src/db';
import { zones } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';

interface Zone {
  id: string;
  name: string;
  polygon: { lat: number; lng: number }[];
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
    polygon: row.polygon as unknown as { lat: number; lng: number }[],
    is_active: row.is_active,
  };
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedZone;
}

export function isInsideZone(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export async function validatePickupZone(lat: number, lng: number): Promise<{ valid: boolean; zone?: Zone }> {
  const zone = await getActiveZone();
  if (!zone) return { valid: true };
  return { valid: isInsideZone(lat, lng, zone.polygon), zone };
}
