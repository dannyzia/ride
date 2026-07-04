import { db } from '../src/db';
import { cityBoundaries } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';
import { normalizePolygon, pointInPolygon, type LatLng } from './polygon';

interface CityBoundary {
  id: string;
  name: string;
  polygon: LatLng[];
}

let cache: CityBoundary[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = parseInt(process.env.CITY_BOUNDARY_CACHE_TTL_MS ?? '60000');

async function loadActiveCities(): Promise<CityBoundary[]> {
  if (cache && Date.now() < cacheExpiry) return cache;

  const rows = await db.select()
    .from(cityBoundaries)
    .where(eq(cityBoundaries.is_active, true));

  // Normalize each polygon (GeoJSON or {lat,lng}[]) into a flat {lat,lng}[] ring.
  // Drop any city whose polygon can't be resolved to >= 3 points.
  cache = rows
    .map(r => ({
      id: r.id,
      name: r.name,
      polygon: normalizePolygon(r.polygon),
    }))
    .filter(c => c.polygon.length >= 3);
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cache;
}

export interface CityDetectionResult {
  origin_city: string | null;
  origin_city_polygon: LatLng[] | null;
}

export async function detectOriginCity(
  pickup: { lat: number; lng: number },
): Promise<CityDetectionResult> {
  const cities = await loadActiveCities();

  for (const city of cities) {
    if (pointInPolygon(pickup.lat, pickup.lng, city.polygon)) {
      return { origin_city: city.name, origin_city_polygon: city.polygon };
    }
  }

  return { origin_city: null, origin_city_polygon: null };
}

export function isIntercity(
  dropoff: { lat: number; lng: number },
  originCityPolygon: LatLng[],
): boolean {
  return !pointInPolygon(dropoff.lat, dropoff.lng, originCityPolygon);
}

export function clearCityBoundaryCache(): void {
  cache = null;
  cacheExpiry = 0;
  logger.info('[cityBoundary] cache cleared');
}
