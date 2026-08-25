/**
 * Encoded-polyline decoder (Google/OSRM standard, precision 1e-5) —
 * FARE FRAMEWORK Phase G trace matching.
 *
 * Hand-rolled: utils-server must not add npm dependencies (the root package
 * uses @mapbox/polyline, but utils-server's package.json does not include
 * it). The standard algorithm is ~20 lines.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Decode an encoded polyline string into {lat, lng} points.
 * Returns [] for empty/invalid input (never throws).
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  if (!encoded || typeof encoded !== 'string') return points;

  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Latitude delta
    let result = 1;
    let shift = 0;
    let b: number;
    do {
      if (index >= encoded.length) return points;
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Longitude delta
    result = 1;
    shift = 0;
    do {
      if (index >= encoded.length) return points;
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}
