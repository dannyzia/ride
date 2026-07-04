import polyline from '@mapbox/polyline';
import * as turf from '@turf/turf';
import { logger } from './logger';
import { haversineKm } from './fareCalc';

// Barikoi v2 route endpoint (same one lib/barikoi.ts uses for distance).
// NOTE: the previous v1 directions URL (https://barikoi.xyz/v1/api/directions/v1/driving)
// returns HTTP 404 — that path does not exist, which forced the Haversine fallback
// and made the intercity inside/outside split inaccurate.
const BARIKOI_ROUTE_URL = 'https://barikoi.xyz/v2/api/route';
const BARIKOI_TIMEOUT_MS = 8000;

export interface RouteSplitResult {
  inside_km: number;
  outside_km: number;
}

export async function splitRoute(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
  originCityPolygon: { lat: number; lng: number }[],
): Promise<RouteSplitResult> {
  try {
    return await splitRouteBarikoi(pickup, dropoff, originCityPolygon);
  } catch (err) {
    logger.warn('[routeSplit] Barikoi failed, falling back to Haversine', { error: String(err) });
    return splitRouteHaversine(pickup, dropoff, originCityPolygon);
  }
}

async function splitRouteBarikoi(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
  originCityPolygon: { lat: number; lng: number }[],
): Promise<RouteSplitResult> {
  const apiKey = process.env.BARIKOI_API_KEY;
  if (!apiKey) throw new Error('BARIKOI_API_KEY not set');

  const url = `${BARIKOI_ROUTE_URL}/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?api_key=${apiKey}&geometries=polyline`;

  const res = await fetch(url, { signal: AbortSignal.timeout(BARIKOI_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Barikoi returned ${res.status}`);

  const data = await res.json();
  if (data?.code !== 'Ok') throw new Error(`Barikoi code ${data?.code ?? 'unknown'}`);
  const encodedPolyline = data?.routes?.[0]?.geometry;
  if (!encodedPolyline) throw new Error('No route geometry in response');

  const decoded = polyline.decode(encodedPolyline);
  const coordinates = decoded.map(([lat, lng]: [number, number]) => [lng, lat]);

  if (coordinates.length < 2) throw new Error('Route has too few points');

  const turfPolygon = turf.polygon([[
    ...originCityPolygon.map(p => [p.lng, p.lat]),
    [originCityPolygon[0].lng, originCityPolygon[0].lat],
  ]]);

  let insideKm = 0;
  let outsideKm = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const segStart = coordinates[i] as [number, number];
    const segEnd = coordinates[i + 1] as [number, number];
    const midLng = (segStart[0] + segEnd[0]) / 2;
    const midLat = (segStart[1] + segEnd[1]) / 2;
    const segLen = turf.length(turf.lineString([segStart, segEnd]), { units: 'kilometers' });

    if (turf.booleanPointInPolygon(turf.point([midLng, midLat]), turfPolygon)) {
      insideKm += segLen;
    } else {
      outsideKm += segLen;
    }
  }

  return {
    inside_km: Math.round(insideKm * 1000) / 1000,
    outside_km: Math.round(outsideKm * 1000) / 1000,
  };
}

function polygonCentroid(polygon: { lat: number; lng: number }[]): { lat: number; lng: number } {
  let latSum = 0;
  let lngSum = 0;
  for (const p of polygon) {
    latSum += p.lat;
    lngSum += p.lng;
  }
  return { lat: latSum / polygon.length, lng: lngSum / polygon.length };
}

function splitRouteHaversine(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
  originCityPolygon: { lat: number; lng: number }[],
): RouteSplitResult {
  const totalKm = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  const dropoffInside = pointInPolygonSimple(dropoff.lat, dropoff.lng, originCityPolygon);

  if (dropoffInside) {
    return { inside_km: Math.round(totalKm * 1000) / 1000, outside_km: 0 };
  }

  const centroid = polygonCentroid(originCityPolygon);
  const pickupToCentroid = haversineKm(pickup.lat, pickup.lng, centroid.lat, centroid.lng);
  const insideRatio = totalKm > 0 ? Math.min(pickupToCentroid / totalKm, 1) : 0;

  return {
    inside_km: Math.round(totalKm * insideRatio * 1.3 * 1000) / 1000,
    outside_km: Math.round(totalKm * (1 - insideRatio) * 1000) / 1000,
  };
}

function pointInPolygonSimple(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
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
