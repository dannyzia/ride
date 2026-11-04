/**
 * lib/dpmaps/dispatchRouter.ts — dpMaps production dispatch waterfall.
 *
 * Four-state administrative toggle (hot-reloadable via platform_config):
 *   0: off     — 100% vendor, ZERO OSRM calls, zero shadow overhead.
 *   1: shadow  — vendor serves live; async OSRM shadow quote (first-party only).
 *   2: primary — OSRM serves live (300 ms); vendor fallback on timeout/error.
 *   3: sole    — OSRM only; vendor endpoints severed in code.
 *
 * Clean-room invariants:
 * - Vendor quotes are returned as live pass-through only.
 * - Shadow payloads carry first-party OSRM numbers + OSRM geometry only.
 * - Vendor polylines are response-only (for client handset rendering). Never logged or benchmarked.
 */

export type VehicleType = 'car' | 'bike' | 'cng';
export type RoutingMode = 'off' | 'shadow' | 'primary' | 'sole';

/** Canonical per-leg budgets (ms). */
export const OSRM_TIMEOUT_MS = 300;
export const BARIKOI_TIMEOUT_MS = 400;
export const GOOGLE_TIMEOUT_MS = 600;

/** Shadow quote cache contract: key prefix + 24 h TTL (seconds). */
export const SHADOW_KEY_PREFIX = 'shadow:route:';
export const SHADOW_TTL_SECONDS = 86_400;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteRequest {
  tripId: string;
  origin: LatLng;
  destination: LatLng | { tempClientId: string };
  vehicleType: VehicleType;
}

export interface ActiveRouteResult {
  distance_meters: number;
  duration_seconds: number;
  /**
   * Vendor or OSRM polyline for handset display.
   */
  polyline?: string | null;
  provider: 'osrm' | 'barikoi' | 'google' | 'haversine_floor';
  latency_ms: number;
}

export interface OsrmQuote {
  distance_meters: number;
  duration_seconds: number;
  polyline?: string | null;
  vehicleType: VehicleType;
  dispatchedAt: number;
}

export interface RouterDeps {
  getModeRaw: () => unknown;
  isLegalGateOpen?: () => boolean;
  resolveSelection?: (tempClientId: string) => Promise<LatLng | null>;
  osrmRoute: (origin: LatLng, dest: LatLng, vehicle: VehicleType) => Promise<ActiveRouteResult | null>;
  barikoiRoute: (origin: LatLng, dest: LatLng) => Promise<ActiveRouteResult | null>;
  googleRoute: (origin: LatLng, dest: LatLng, tier: string) => Promise<ActiveRouteResult | null>;
  preferGoogle?: boolean;
  serviceTier?: string;
  recordShadow?: (key: string, quote: OsrmQuote, ttlSeconds: number) => Promise<void>;
  tripHash?: (tripId: string) => string;
  onAlert?: (severity: 'P1' | 'P2', code: string) => void;
  now?: () => number;
}

const MODE_BY_NUMBER: Record<number, RoutingMode> = {
  0: 'off',
  1: 'shadow',
  2: 'primary',
  3: 'sole',
};
const VALID_MODES: readonly RoutingMode[] = ['off', 'shadow', 'primary', 'sole'];

export function normalizeMode(raw: unknown): { mode: RoutingMode; invalid: boolean } {
  if (typeof raw === 'number' && Number.isInteger(raw) && MODE_BY_NUMBER[raw] !== undefined) {
    return { mode: MODE_BY_NUMBER[raw], invalid: false };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed in MODE_BY_NUMBER) {
      return { mode: MODE_BY_NUMBER[Number(trimmed)], invalid: false };
    }
    if ((VALID_MODES as readonly string[]).includes(trimmed)) {
      return { mode: trimmed as RoutingMode, invalid: false };
    }
  }
  return { mode: 'off', invalid: true };
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function getHaversineFallback(origin: LatLng, dest: LatLng): ActiveRouteResult {
  const directMeters = haversineMeters(origin.lat, origin.lng, dest.lat, dest.lng);
  const roadMeters = directMeters * 1.3;
  const estSeconds = Math.round((roadMeters / 18000) * 3600); // 18 km/h baseline
  return {
    distance_meters: Math.round(roadMeters),
    duration_seconds: estSeconds,
    provider: 'haversine_floor',
    latency_ms: 0,
    polyline: null,
  };
}

export function errorPct(pred: number, actual: number): number {
  if (!(actual > 0)) throw new Error('errorPct: actual must be > 0');
  return Number((Math.abs(pred - actual) / actual) * 100);
}

function isTempClientRef(dest: LatLng | { tempClientId: string }): dest is { tempClientId: string } {
  return typeof (dest as { tempClientId?: unknown }).tempClientId === 'string';
}

async function resolveDestination(
  dest: LatLng | { tempClientId: string },
  resolveSelection?: RouterDeps['resolveSelection'],
): Promise<LatLng | null> {
  if (!isTempClientRef(dest)) return dest;
  if (!resolveSelection) return null;
  return resolveSelection(dest.tempClientId);
}

export async function calculateDispatchRoute(req: RouteRequest, deps: RouterDeps): Promise<ActiveRouteResult> {
  const alert = deps.onAlert ?? ((): void => undefined);
  const now = deps.now ?? Date.now;
  let { mode, invalid } = normalizeMode(deps.getModeRaw());
  if (invalid) alert('P1', 'INVALID_ROUTING_MODE_FAILSAFE_OFF');

  // Legal gate check: default true if not provided
  if (mode === 'shadow' && !(deps.isLegalGateOpen?.() ?? true)) {
    alert('P1', 'SHADOW_BLOCKED_LEGAL_GATE_LOCK');
    mode = 'off';
  }

  const destCoords = await resolveDestination(req.destination, deps.resolveSelection);
  if (!destCoords) throw new Error('SELECTION_EXPIRED_PLEASE_RESELECT');

  if (mode === 'sole') {
    const osrm = await deps.osrmRoute(req.origin, destCoords, req.vehicleType);
    if (osrm) return osrm;
    return getHaversineFallback(req.origin, destCoords);
  }

  const fetchVendorRoute = async (o: LatLng, d: LatLng): Promise<ActiveRouteResult | null> => {
    if (deps.preferGoogle) {
      const g = await deps.googleRoute(o, d, deps.serviceTier ?? 'sedan');
      if (g) return g;
      alert('P2', 'GOOGLE_FALLBACK_BARIKOI');
      return deps.barikoiRoute(o, d);
    }
    const b = await deps.barikoiRoute(o, d);
    if (b) return b;
    alert('P2', 'BARIKOI_FALLBACK_GOOGLE');
    return deps.googleRoute(o, d, deps.serviceTier ?? 'sedan');
  };

  if (mode === 'primary') {
    const osrm = await deps.osrmRoute(req.origin, destCoords, req.vehicleType);
    if (osrm) return osrm;
    alert('P2', 'OSRM_FALLBACK_VENDOR');
    const vendor = await fetchVendorRoute(req.origin, destCoords);
    if (vendor) return vendor;
    return getHaversineFallback(req.origin, destCoords);
  }

  if (mode === 'shadow') {
    const active =
      (await fetchVendorRoute(req.origin, destCoords)) ??
      getHaversineFallback(req.origin, destCoords);

    // Non-blocking async shadow evaluation — first-party OSRM quote only.
    const sink = deps.recordShadow;
    const hash = deps.tripHash ?? ((id: string) => id);
    if (sink) {
      const origin = req.origin;
      const vehicleType = req.vehicleType;
      const tripId = req.tripId;
      const dispatchedAt = now();
      const osrmRoute = deps.osrmRoute;
      setTimeout(() => {
        osrmRoute(origin, destCoords, vehicleType)
          .then((q) => {
            if (!q) return;
            const quote: OsrmQuote = {
              distance_meters: q.distance_meters,
              duration_seconds: q.duration_seconds,
              polyline: q.polyline,
              vehicleType,
              dispatchedAt,
            };
            return sink(`${SHADOW_KEY_PREFIX}${hash(tripId)}`, quote, SHADOW_TTL_SECONDS);
          })
          .catch(() => undefined);
      }, 0);
    }
    return active;
  }

  // Mode 0: off — vendor only. ZERO OSRM calls, ZERO shadow quotes.
  const vendorResult = await fetchVendorRoute(req.origin, destCoords);
  if (vendorResult) return vendorResult;
  return getHaversineFallback(req.origin, destCoords);
}
