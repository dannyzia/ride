/**
 * lib/dpmaps/mapsRouter.ts — Facade for dispatch routing, waterfall execution,
 * and shadow quote benchmarking.
 */

import { createHmac } from 'crypto';
import { getConfigValue } from '@/lib/platformConfig';
import { logger } from '@/lib/logger';
import {
  calculateDispatchRoute,
  getHaversineFallback,
  type ActiveRouteResult,
  type OsrmQuote,
  type VehicleType,
} from './dispatchRouter';
import { OsrmRoutingClient } from './osrmRoutingClient';
import { resolveDestinationSession } from './destSession';

const BARIKOI_API_KEY = process.env.BARIKOI_API_KEY ?? '';
const GOOGLE_MAPS_SERVER_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY ?? '';
const INGESTION_SALT = process.env.DPMAPS_INGESTION_SALT || 'ride-dpmaps-cleanroom-2026';

export interface DispatchRouteResult {
  distanceKm: number;
  durationMin: number;
  provider: 'osrm' | 'barikoi' | 'google' | 'haversine_floor';
  polyline: string | null;
  latencyMs: number;
}

// In-memory cache for recent shadow quotes (benchmark & audit inspection)
export const shadowQuotesCache = new Map<string, OsrmQuote>();
const MAX_SHADOW_CACHE = 500;

export function recordShadowQuote(key: string, quote: OsrmQuote): void {
  if (shadowQuotesCache.size >= MAX_SHADOW_CACHE) {
    const oldestKey = shadowQuotesCache.keys().next().value;
    if (oldestKey) shadowQuotesCache.delete(oldestKey);
  }
  shadowQuotesCache.set(key, quote);
}

export function computeTripHash(tripId: string): string {
  return createHmac('sha256', INGESTION_SALT).update(tripId).digest('hex').slice(0, 32);
}

/**
 * Fetch route via Barikoi Directions API
 */
async function executeBarikoiRoute(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  timeoutMs: number,
): Promise<ActiveRouteResult | null> {
  if (!BARIKOI_API_KEY) return null;
  const start = Date.now();
  // Barikoi uses lng,lat pairs
  const url = `https://barikoi.xyz/v2/api/route/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?api_key=${BARIKOI_API_KEY}&geometries=polyline`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    if (body.code !== 'Ok' || !body.routes?.length) return null;

    const route = body.routes[0];
    const distanceM = Math.round(route.distance ?? 0);
    const durationS = Math.round(route.duration ?? 0);
    const polyline = typeof route.geometry === 'string' && route.geometry.length > 0 ? route.geometry : null;

    return {
      distance_meters: distanceM,
      duration_seconds: durationS,
      polyline,
      provider: 'barikoi',
      latency_ms: Date.now() - start,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch route via Google Directions API
 */
async function executeGoogleRoute(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  timeoutMs: number,
): Promise<ActiveRouteResult | null> {
  if (!GOOGLE_MAPS_SERVER_API_KEY) return null;
  const start = Date.now();
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&key=${GOOGLE_MAPS_SERVER_API_KEY}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    if (body.status !== 'OK' || !body.routes?.[0]?.legs?.length) return null;

    const leg = body.routes[0].legs[0];
    const distanceM = Math.round(leg.distance?.value ?? 0);
    const durationS = Math.round(leg.duration?.value ?? 0);
    const polyline = body.routes[0].overview_polyline?.points ?? null;

    return {
      distance_meters: distanceM,
      duration_seconds: durationS,
      polyline,
      provider: 'google',
      latency_ms: Date.now() - start,
    };
  } catch {
    return null;
  }
}

/**
 * Get the vehicle-specific OSRM endpoint URL configured in platform_config
 */
async function getOsrmEndpoint(vehicle: VehicleType): Promise<string> {
  switch (vehicle) {
    case 'bike':
      return getConfigValue('dpmaps_osrm_bike_url', 'http://localhost:5002');
    case 'cng':
      return getConfigValue('dpmaps_osrm_cng_url', 'http://localhost:5003');
    case 'car':
    default:
      return getConfigValue('dpmaps_osrm_car_url', 'http://localhost:5001');
  }
}

/**
 * Main entrypoint for route calculation and dispatch routing.
 * Resolves hot-reloadable mode from platform_config and executes waterfall.
 */
export async function getDispatchRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  vehicleType: VehicleType = 'car',
  tripId = `trip-${Date.now()}`,
  preferBarikoi = true,
): Promise<DispatchRouteResult> {
  const mode = await getConfigValue('routing_provider_mode', 'shadow');
  const osrmTimeout = parseInt(await getConfigValue('dpmaps_osrm_timeout_ms', '300'), 10) || 300;
  const barikoiTimeout = parseInt(await getConfigValue('dpmaps_barikoi_timeout_ms', '400'), 10) || 400;

  const osrmBaseUrl = await getOsrmEndpoint(vehicleType);
  const osrmClient = new OsrmRoutingClient(vehicleType, osrmBaseUrl, osrmTimeout);

  const origin = { lat: originLat, lng: originLng };
  const destination = { lat: destLat, lng: destLng };

  const result = await calculateDispatchRoute(
    {
      tripId,
      origin,
      destination,
      vehicleType,
    },
    {
      getModeRaw: () => mode,
      isLegalGateOpen: () => true,
      preferGoogle: !preferBarikoi,
      resolveSelection: async (token: string) => resolveDestinationSession(token),
      osrmRoute: async (o, d) => osrmClient.route(o, d),
      barikoiRoute: async (o, d) => executeBarikoiRoute(o, d, barikoiTimeout),
      googleRoute: async (o, d) => executeGoogleRoute(o, d, 600),
      recordShadow: async (key, quote) => {
        recordShadowQuote(key, quote);
      },
      tripHash: computeTripHash,
      onAlert: (severity, code) => {
        logger.warn(`[dpmaps/alert] ${severity}: ${code}`, { tripId, mode });
      },
    },
  ).catch((err: unknown) => {
    logger.error('[dpmaps] routing error, using haversine fallback', err);
    return getHaversineFallback(origin, destination);
  });

  return {
    distanceKm: Math.round((result.distance_meters / 1000) * 1000) / 1000,
    durationMin: Math.round((result.duration_seconds / 60) * 10) / 10,
    provider: result.provider,
    polyline: result.polyline ?? null,
    latencyMs: result.latency_ms,
  };
}
