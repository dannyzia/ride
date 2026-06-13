import { db } from '../src/db';
import { cityBoundaries } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';

interface CityBoundary {
  id: string;
  name: string;
  polygon: { lat: number; lng: number }[];
}

let cache: CityBoundary[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = parseInt(process.env.CITY_BOUNDARY_CACHE_TTL_MS ?? '60000');

async function loadActiveCities(): Promise<CityBoundary[]> {
  if (cache && Date.now() < cacheExpiry) return cache;

  const rows = await db.select()
    .from(cityBoundaries)
    .where(eq(cityBoundaries.is_active, true));

  cache = rows.map(r => ({
    id: r.id,
    name: r.name,
    polygon: r.polygon as unknown as { lat: number; lng: number }[],
  }));
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cache;
}

function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
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

export interface CityDetectionResult {
  origin_city: string | null;
  origin_city_polygon: { lat: number; lng: number }[] | null;
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
  originCityPolygon: { lat: number; lng: number }[],
): boolean {
  return !pointInPolygon(dropoff.lat, dropoff.lng, originCityPolygon);
}

export function clearCityBoundaryCache(): void {
  cache = null;
  cacheExpiry = 0;
  logger.info('[cityBoundary] cache cleared');
}
