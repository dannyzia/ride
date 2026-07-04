/**
 * Shared polygon helpers.
 *
 * Polygon columns (`zones.polygon`, `city_boundaries.polygon`) are stored as
 * jsonb and have been observed in multiple shapes:
 *   - GeoJSON Polygon:    { type:"Polygon",    coordinates:[[[lng,lat],...]] }
 *   - GeoJSON MultiPolygon:{ type:"MultiPolygon",coordinates:[[[[lng,lat],...]]] }
 *   - bare GeoJSON ring:  [[lng,lat],...]
 *   - canonical app fmt:  { lat, lng }[]
 *   - {latitude,longitude}[] variant
 *
 * The readers (lib/zone.ts, lib/cityBoundary.ts) require a flat {lat,lng}[]
 * ring. Casting raw jsonb `as {lat,lng}[]` silently produced a non-array when
 * the data was GeoJSON, which made every point-in-polygon test return false
 * (the loop never executed) — i.e. every pickup was rejected as "outside_zone".
 *
 * normalizePolygon() collapses all of the above into a single {lat,lng}[] ring.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

function toLatLng(lngLat: { lat?: number; lng?: number } | number[] | undefined): LatLng | null {
  if (!lngLat) return null;
  if (Array.isArray(lngLat)) {
    // [lng, lat] (GeoJSON order)
    const lng = Number(lngLat[0]);
    const lat = Number(lngLat[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }
  const lat = Number((lngLat as { lat?: number }).lat ?? (lngLat as { latitude?: number }).latitude);
  const lng = Number((lngLat as { lng?: number }).lng ?? (lngLat as { longitude?: number }).longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

/**
 * Normalize any supported polygon shape into a flat {lat,lng}[] ring.
 * For MultiPolygon the outer ring of the first polygon is used (sufficient
 * for the simple ray-casting containment checks used in dispatch/zone logic).
 * Returns [] for unrecognized shapes or rings with fewer than 3 valid points.
 */
export function normalizePolygon(raw: unknown): LatLng[] {
  if (!raw) return [];

  // {lat,lng}[] or {latitude,longitude}[]
  if (Array.isArray(raw) && raw.length > 0 && typeof (raw[0] as { lat?: unknown })?.lat === "number") {
    return (raw as unknown[])
      .map((p) => toLatLng(p as Parameters<typeof toLatLng>[0]))
      .filter((p): p is LatLng => p !== null);
  }

  // bare ring of [lng,lat] pairs
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    return (raw as unknown[])
      .map((p) => toLatLng(p as number[]))
      .filter((p): p is LatLng => p !== null);
  }

  // GeoJSON object { type, coordinates }
  if (typeof raw === "object" && raw !== null) {
    const gj = raw as { type?: string; coordinates?: unknown };
    if (Array.isArray(gj.coordinates)) {
      let ring: unknown[] | undefined;
      if (gj.type === "Polygon") {
        ring = (gj.coordinates as unknown[][])[0] as unknown[] | undefined;
      } else if (gj.type === "MultiPolygon") {
        ring = (gj.coordinates as unknown[][][])[0]?.[0] as unknown[] | undefined;
      } else {
        // Unknown type with coordinates: try Polygon shape first, then bare ring.
        const c = gj.coordinates as unknown[];
        if (c.length > 0 && Array.isArray(c[0]) && Array.isArray((c[0] as unknown[])[0])) {
          ring = (c[0] as unknown[])[0] as unknown[] | undefined;
          // fall back: if that wasn't an array of arrays, treat c itself as a ring
          if (!Array.isArray(ring)) ring = c;
        } else {
          ring = c;
        }
      }
      if (ring) {
        return (ring as unknown[])
          .map((p) => toLatLng(p as number[]))
          .filter((p): p is LatLng => p !== null);
      }
    }
  }

  return [];
}

/** Standard even-odd ray-casting point-in-polygon. `polygon` must be {lat,lng}[]. */
export function pointInPolygon(lat: number, lng: number, polygon: LatLng[]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng,
      yi = polygon[i].lat;
    const xj = polygon[j].lng,
      yj = polygon[j].lat;
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
