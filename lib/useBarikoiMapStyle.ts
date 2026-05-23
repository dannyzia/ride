import Constants from 'expo-constants';

const BARIKOI_API_KEY = Constants.expoConfig?.extra?.BARIKOI_API_KEY as string ?? '';

// Dark map style JSON for MapLibre (Barikoi vector tile style)
export const DARK_MAP_STYLE = 'https://tiles.barikoi.com/styles/barikoi-dark/style.json';

// Light map style JSON for MapLibre
export const LIGHT_MAP_STYLE = 'https://tiles.barikoi.com/styles/barikoi-light/style.json';

export function getBarikoiApiKey(): string {
  return BARIKOI_API_KEY;
}

export function getBarikoiMapStyle(dark: boolean = false): string {
  return dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE;
}

// Helper: construct Barikoi autocomplete URL
export function getBarikoiAutocompleteUrl(query: string, lat?: number, lng?: number): string {
  const params = new URLSearchParams({
    q: query,
    api_key: BARIKOI_API_KEY,
  });
  if (lat !== undefined && lng !== undefined) {
    params.set('lat', String(lat));
    params.set('lon', String(lng));
  }
  return `https://barikoi.xyz/v1/api/search/autocomplete/${BARIKOI_API_KEY}/place?${params}`;
}

// Helper: construct Barikoi place details URL
export function getBarikoiPlaceDetailUrl(placeId: string): string {
  return `https://barikoi.xyz/v1/api/search/details/${BARIKOI_API_KEY}/place?place_id=${placeId}`;
}

// Helper: construct Barikoi reverse geocode URL
export function getBarikoiReverseGeocodeUrl(lat: number, lng: number): string {
  return `https://barikoi.xyz/v1/api/search/reverse/${BARIKOI_API_KEY}/geocode?lat=${lat}&lon=${lng}`;
}

// Helper: construct Barikoi directions URL
export function getBarikoiDirectionsUrl(
  originLat: number, originLng: number,
  destLat: number, destLng: number
): string {
  return `https://barikoi.xyz/v1/api/distance/directions/${BARIKOI_API_KEY}?from=${originLng},${originLat}&to=${destLng},${destLat}`;
}

// Helper: construct Barikoi distance matrix URL
export function getBarikoiDistanceMatrixUrl(
  origins: { lat: number; lng: number }[],
  destinations: { lat: number; lng: number }[]
): string {
  const src = origins.map(o => `${o.lng},${o.lat}`).join('|');
  const dst = destinations.map(d => `${d.lng},${d.lat}`).join('|');
  return `https://barikoi.xyz/v1/api/distance/matrix/${BARIKOI_API_KEY}?src=${src}&dst=${dst}`;
}

// MapLibre-friendly coordinate order: [longitude, latitude] (GeoJSON)
// react-native-maps uses {latitude, longitude} — convert when needed
export function toGeoJsonCoord(lat: number, lng: number): [number, number] {
  return [lng, lat];
}
