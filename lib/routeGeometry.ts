import polyline from "@mapbox/polyline";
import { logger } from "./logger";

/**
 * Client-side Barikoi route polyline fetch for static map snapshots
 * (ride detail receipts, etc.).
 *
 * Uses the public EXPO_PUBLIC_BARIKOI_API_KEY — the same key already serves
 * map tiles (`utils/mapUtils.ts`) and autocomplete, so it is client-safe.
 * The endpoint + response shape mirror the server-side call in
 * `lib/routeSplit.ts` (Barikoi v2 route API, `geometries=polyline`,
 * `routes[0].geometry` = encoded polyline).
 *
 * Returns decoded [lat, lng] pairs, or null on any failure — callers treat
 * it as non-blocking decoration; markers still render without a line.
 */

const BARIKOI_ROUTE_URL = "https://barikoi.xyz/v2/api/route";
const ROUTE_TIMEOUT_MS = 6000;

export async function fetchRouteGeometry(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): Promise<[number, number][] | null> {
  const apiKey = process.env.EXPO_PUBLIC_BARIKOI_API_KEY ?? "";
  if (!apiKey) return null;

  // Manual AbortController (not AbortSignal.timeout) — Hermes client support
  // for the static timeout helper is not guaranteed.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

  try {
    const url = `${BARIKOI_ROUTE_URL}/${originLng},${originLat};${destinationLng},${destinationLat}?api_key=${apiKey}&geometries=polyline`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data: unknown = await res.json();

    const code = (data as { code?: unknown })?.code;
    if (code !== "Ok") return null;

    const encoded: unknown = (data as { routes?: { geometry?: unknown }[] })?.routes?.[0]?.geometry;
    if (typeof encoded !== "string" || encoded.length === 0) return null;

    const decoded = polyline.decode(encoded) as [number, number][];
    if (!Array.isArray(decoded) || decoded.length < 2) return null;
    return decoded;
  } catch (err) {
    logger.warn("[routeGeometry] route fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
