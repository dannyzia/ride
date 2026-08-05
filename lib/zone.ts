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

/**
 * Fallback polygon: simplified Bangladesh mainland border (~100 points).
 * Used when the DB polygon is missing or malformed so rides are never
 * blocked by a configuration gap. Source: bangladesh-geojson, exterior ring.
 */
const BANGLADESH_FALLBACK_POLYGON: LatLng[] = [
  {lat:25.999,lng:89.460},{lat:26.033,lng:89.326},{lat:26.115,lng:89.235},{lat:26.211,lng:89.146},
  {lat:26.306,lng:89.134},{lat:26.399,lng:89.071},{lat:26.440,lng:88.949},{lat:26.331,lng:88.956},
  {lat:26.308,lng:89.023},{lat:26.239,lng:88.965},{lat:26.291,lng:88.745},{lat:26.302,lng:88.685},
  {lat:26.344,lng:88.695},{lat:26.469,lng:88.596},{lat:26.608,lng:88.390},{lat:26.431,lng:88.489},
  {lat:26.353,lng:88.443},{lat:26.222,lng:88.351},{lat:26.154,lng:88.184},{lat:25.944,lng:88.113},
  {lat:25.802,lng:88.193},{lat:25.696,lng:88.385},{lat:25.521,lng:88.552},{lat:25.517,lng:88.786},
  {lat:25.315,lng:88.928},{lat:25.200,lng:88.934},{lat:25.187,lng:88.743},{lat:25.200,lng:88.440},
  {lat:24.997,lng:88.414},{lat:24.884,lng:88.321},{lat:24.882,lng:88.155},{lat:24.422,lng:88.285},
  {lat:24.017,lng:88.735},{lat:23.866,lng:88.654},{lat:23.724,lng:88.569},{lat:23.525,lng:88.696},
  {lat:23.442,lng:88.783},{lat:23.298,lng:88.719},{lat:23.233,lng:88.896},{lat:23.166,lng:88.933},
  {lat:23.008,lng:88.846},{lat:22.758,lng:88.911},{lat:22.299,lng:89.024},{lat:22.037,lng:89.092},
  {lat:22.122,lng:89.178},{lat:22.232,lng:89.182},{lat:22.168,lng:89.261},{lat:22.162,lng:89.416},
  {lat:22.271,lng:89.424},{lat:22.328,lng:89.424},{lat:22.343,lng:89.461},{lat:22.208,lng:89.527},
  {lat:22.280,lng:89.615},{lat:22.244,lng:89.645},{lat:22.242,lng:89.721},{lat:22.220,lng:89.808},
  {lat:22.182,lng:90.023},{lat:21.924,lng:90.030},{lat:22.175,lng:90.409},{lat:22.024,lng:90.440},
  {lat:21.862,lng:90.372},{lat:21.703,lng:90.419},{lat:21.564,lng:90.310},{lat:21.449,lng:90.340},
  {lat:21.366,lng:90.540},{lat:21.428,lng:90.691},{lat:21.596,lng:90.780},{lat:21.691,lng:90.767},
  {lat:21.798,lng:90.673},{lat:21.886,lng:90.634},{lat:21.961,lng:90.662},{lat:22.061,lng:90.640},
  {lat:22.137,lng:90.577},{lat:22.221,lng:90.580},{lat:22.285,lng:90.665},{lat:22.321,lng:90.772},
  {lat:22.370,lng:90.835},{lat:22.522,lng:90.863},{lat:22.594,lng:90.851},{lat:22.673,lng:90.866},
  {lat:22.734,lng:90.859},{lat:22.811,lng:90.778},{lat:22.873,lng:90.716},{lat:22.989,lng:90.654},
  {lat:23.095,lng:90.560},{lat:23.215,lng:90.556},{lat:23.274,lng:90.620},{lat:23.285,lng:90.710},
  {lat:23.369,lng:90.796},{lat:23.509,lng:90.849},{lat:23.559,lng:90.744},{lat:23.576,lng:90.602},
  {lat:23.617,lng:90.558},{lat:23.751,lng:90.495},{lat:23.842,lng:90.512},{lat:23.910,lng:90.437},
  {lat:24.023,lng:90.304},{lat:24.118,lng:90.240},{lat:24.264,lng:90.211},{lat:24.396,lng:90.222},
  {lat:24.554,lng:90.182},{lat:24.686,lng:90.158},{lat:24.781,lng:90.184},{lat:24.866,lng:90.279},
  {lat:25.002,lng:90.293},{lat:25.087,lng:90.370},{lat:25.155,lng:90.442},{lat:25.281,lng:90.456},
  {lat:25.391,lng:90.459},{lat:25.555,lng:90.372},{lat:25.653,lng:90.290},{lat:25.728,lng:90.172},
  {lat:25.763,lng:90.043},{lat:25.809,lng:89.915},{lat:25.848,lng:89.772},{lat:25.937,lng:89.589},
  {lat:25.999,lng:89.460},
];

export async function getActiveZone(): Promise<Zone | null> {
  if (Date.now() < cacheExpiry && cachedZone) return cachedZone;

  const [row] = await db.select()
    .from(zones)
    .where(eq(zones.is_active, true))
    .limit(1);

  if (!row) {
    logger.warn('[zone] no active zone configured — using Bangladesh fallback polygon');
    cachedZone = {
      id: 'fallback',
      name: 'Bangladesh (fallback)',
      polygon: BANGLADESH_FALLBACK_POLYGON,
      is_active: true,
    };
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return cachedZone;
  }

  const polygon = normalizePolygon(row.polygon);

  // If the DB polygon is malformed/empty, use the Bangladesh fallback
  // so rides are never blocked by a configuration gap.
  if (!polygon || polygon.length < 3) {
    logger.warn('[zone] active zone has invalid polygon — using Bangladesh fallback', {
      zoneId: row.id,
      zoneName: row.name,
      rawPolygonType: typeof row.polygon,
      rawPolygonLength: Array.isArray(row.polygon) ? row.polygon.length : 'not-array',
    });
    cachedZone = {
      id: row.id,
      name: row.name,
      polygon: BANGLADESH_FALLBACK_POLYGON,
      is_active: true,
    };
  } else {
    cachedZone = {
      id: row.id,
      name: row.name,
      polygon,
      is_active: row.is_active,
    };
  }

  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedZone;
}

export function isInsideZone(lat: number, lng: number, polygon: LatLng[]): boolean {
  return pointInPolygon(lat, lng, polygon);
}

export async function validatePickupZone(lat: number, lng: number): Promise<{ valid: boolean; zone?: Zone }> {
  const zone = await getActiveZone();
  if (!zone) return { valid: true };
  const inside = isInsideZone(lat, lng, zone.polygon);
  if (!inside) {
    logger.info('[zone] pickup outside zone polygon', {
      lat, lng,
      zoneName: zone.name,
      zoneId: zone.id,
      polygonPoints: zone.polygon.length,
    });
  }
  return { valid: inside, zone };
}
