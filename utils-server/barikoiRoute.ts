/**
 * Barikoi Directions route client — FARE FRAMEWORK Phase F, quote state 2
 * (SG-1).
 *
 * Deliberately NOT a reuse of root lib/barikoi.ts: that module resolves a
 * maps_provider toggle from system_config via the root DB client and carries
 * Google + haversine fallbacks. The firm-km figure must be ROAD-NETWORK
 * distance per framework §3c — a haversine or Google fallback baked in here
 * would silently violate that, so this client calls the Barikoi Directions
 * API directly and returns null on ANY failure (non-200, timeout, malformed
 * body). The caller's low-confidence path (ruling 11) handles nulls
 * uniformly; no fallback logic lives in this file.
 *
 * Reads BARIKOI_API_KEY from utils-server/.env (already declared optional in
 * lib/env.ts utilsServerEnvSchema — a missing key simply yields null).
 */

import { logger } from '../lib/logger';

const ROUTE_TIMEOUT_MS = 8_000;

interface BarikoiRouteResponse {
  code?: string;
  routes?: {
    distance?: number; // metres
    duration?: number; // seconds
  }[];
}

/**
 * Road-network distance between two points via the Barikoi Directions API
 * (same URL/key convention as root lib/barikoi.ts). Never throws: any
 * failure — missing key, non-200, 8 s timeout, malformed body — returns null.
 */
export async function getFirmRouteKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ distanceKm: number } | null> {
  const apiKey = process.env.BARIKOI_API_KEY ?? '';
  if (!apiKey) return null;

  // GeoJSON convention: lng,lat pairs (mirrors root lib/barikoi.ts).
  const url = `https://barikoi.xyz/v2/api/route/${originLng},${originLat};${destLng},${destLat}?api_key=${apiKey}&geometries=polyline`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn('[barikoiRoute] firm route API non-ok', { status: res.status });
      return null;
    }
    const body: unknown = await res.json();
    if (
      !body ||
      typeof body !== 'object' ||
      (body as BarikoiRouteResponse).code !== 'Ok' ||
      !Array.isArray((body as BarikoiRouteResponse).routes) ||
      (body as BarikoiRouteResponse).routes!.length === 0
    ) {
      logger.warn('[barikoiRoute] firm route API unexpected response');
      return null;
    }
    const distanceM = (body as BarikoiRouteResponse).routes![0].distance;
    if (typeof distanceM !== 'number' || !Number.isFinite(distanceM) || distanceM < 0) {
      logger.warn('[barikoiRoute] firm route API malformed distance');
      return null;
    }
    return { distanceKm: distanceM / 1000 };
  } catch (e: unknown) {
    // Includes the AbortError from the 8 s timeout — never throws to caller.
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('[barikoiRoute] firm route API error', { error: msg });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
