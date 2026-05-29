/**
 * Server-side Barikoi API utility.
 *
 * Provides route distance / duration using the Barikoi Directions API,
 * with Google Maps Directions as fallback and Haversine × 1.3 as
 * final fallback (controlled by maps_provider toggle in system_config).
 */

import { db } from '@/src/db';
import { systemConfig } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';
import { haversineKm } from './fareCalc';

const BARIKOI_API_KEY = process.env.BARIKOI_API_KEY ?? '';
const GOOGLE_MAPS_SERVER_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY ?? '';

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  provider: 'barikoi' | 'google' | 'haversine_fallback';
}

interface BarikoiRouteResponse {
  code: string;
  routes?: {
    distance: number;  // metres
    duration: number;  // seconds
    legs: { distance: number; duration: number }[];
  }[];
  waypoints?: unknown[];
}

interface GoogleRouteResponse {
  routes?: {
    legs?: {
      distance?: { value: number };  // metres
      duration?: { value: number };  // seconds
    }[];
  }[];
  status: string;
}

/**
 * Fetch route distance and duration from Barikoi Direction API.
 *
 * @param originLng  — lng (not lat) per GeoJSON convention
 * @param originLat  — lat
 * @param destLng   — lng (not lat) per GeoJSON convention
 * @param destLat   — lat
 */
async function barikoiRoute(
  originLng: number, originLat: number,
  destLng: number, destLat: number,
): Promise<RouteResult | null> {
  if (!BARIKOI_API_KEY) return null;

  const url = `https://barikoi.xyz/v2/api/route/${originLng},${originLat};${destLng},${destLat}?api_key=${BARIKOI_API_KEY}&geometries=polyline`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      logger.warn('[barikoi] route API non-ok', { status: res.status });
      return null;
    }
    const body: BarikoiRouteResponse = await res.json();
    if (body.code !== 'Ok' || !body.routes?.length) {
      logger.warn('[barikoi] route API unexpected response', { code: body.code });
      return null;
    }

    const route = body.routes[0];
    const distanceKm = route.distance / 1000;
    const durationMin = route.duration / 60;
    return { distanceKm, durationMin, provider: 'barikoi' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[barikoi] route API error', { error: msg });
    return null;
  }
}

/**
 * Fallback: Google Maps Directions API.
 */
async function googleRoute(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
): Promise<RouteResult | null> {
  if (!GOOGLE_MAPS_SERVER_API_KEY) return null;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&key=${GOOGLE_MAPS_SERVER_API_KEY}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const body: GoogleRouteResponse = await res.json();
    if (body.status !== 'OK' || !body.routes?.[0]?.legs?.length) return null;

    const leg = body.routes[0].legs[0];
    const distanceKm = (leg.distance?.value ?? 0) / 1000;
    const durationMin = (leg.duration?.value ?? 0) / 60;
    return { distanceKm, durationMin, provider: 'google' };
  } catch {
    return null;
  }
}

/**
 * Read the maps_provider toggle from system_config.
 * Defaults to 'barikoi' if not set or on error.
 */
export async function getMapsProvider(): Promise<'barikoi' | 'google'> {
  try {
    const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, 'maps_provider')).limit(1);
    if (row?.value === 'google') return 'google';
    return 'barikoi';
  } catch {
    return 'barikoi';
  }
}

/**
 * Convenience wrapper: reads maps_provider toggle, then returns
 * route distance using the active provider's API.
 */
export async function getRouteDistance(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
): Promise<RouteResult> {
  const provider = await getMapsProvider();
  return getRouteDistanceDuration(originLat, originLng, destLat, destLng, provider === 'barikoi');
}

/**
 * Get route distance and duration between two points.
 *
 * Resolution order:
 *   1. Barikoi Directions (primary)
 *   2. Google Maps Directions (fallback 1)
 *   3. Haversine × 1.3 (final fallback)
 *
 * Coordinates are in (lat, lng) — converted to GeoJSON inside.
 */
export async function getRouteDistanceDuration(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
  preferBarikoi = true,
): Promise<RouteResult> {
  // Primary: Barikoi
  if (preferBarikoi) {
    const barikoi = await barikoiRoute(originLng, originLat, destLng, destLat);
    if (barikoi) return barikoi;

    // Fallback 1: Google
    const google = await googleRoute(originLat, originLng, destLat, destLng);
    if (google) return google;
  } else {
    // Google preferred
    const google = await googleRoute(originLat, originLng, destLat, destLng);
    if (google) return google;

    const barikoi = await barikoiRoute(originLng, originLat, destLng, destLat);
    if (barikoi) return barikoi;
  }

  // Final fallback: Haversine × 1.3 (urban road factor)
  const directKm = haversineKm(originLat, originLng, destLat, destLng);
  const distanceKm = Math.round(directKm * 1.3 * 1000) / 1000;
  // Assume 20 km/h average urban speed for ETA estimate
  const durationMin = Math.round((distanceKm / 20) * 60 * 10) / 10;
  return { distanceKm, durationMin, provider: 'haversine_fallback' };
}
