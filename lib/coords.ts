/**
 * Coordinate conversion utilities.
 *
 * Discipline:
 *   - Database stores (lat, lng) as separate numeric columns.
 *   - MapLibre / GeoJSON uses [lng, lat] order.
 *   - Conversion happens only at the map/adapter layer.
 */

/** Convert DB (lat, lng) to MapLibre/GeoJSON [lng, lat]. */
export function toBarikoi(lat: number, lng: number): [number, number] {
  return [lng, lat];
}

/** Convert MapLibre/GeoJSON [lng, lat] back to { lat, lng }. */
export function fromBarikoi(coords: [number, number]): { lat: number; lng: number } {
  return { lat: coords[1], lng: coords[0] };
}

/** Convert a DB coordinate pair to a GeoJSON Position array. */
export function toGeoJsonPosition(lat: number, lng: number): [number, number] {
  return [lng, lat];
}

/** Alias for toBarikoi — semantic when writing MapLibre coordinate props. */
export const toMapLibreCoord = toBarikoi;
