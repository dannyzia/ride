const BARIKOI_API_KEY = process.env.EXPO_PUBLIC_BARIKOI_API_KEY ?? "";

// Dark map style JSON for MapLibre (Barikoi vector tile style)
export const DARK_MAP_STYLE =
  "https://tiles.barikoi.com/styles/barikoi-dark/style.json";

// Light map style JSON for MapLibre
export const LIGHT_MAP_STYLE =
  "https://tiles.barikoi.com/styles/barikoi-light/style.json";

export function getBarikoiApiKey(): string {
  return BARIKOI_API_KEY;
}

export function getBarikoiMapStyle(dark: boolean = false): string {
  return dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE;
}

// Helper: construct Barikoi autocomplete URL (v2)
export function getBarikoiAutocompleteUrl(
  query: string,
  lat?: number,
  lng?: number,
): string {
  const params = new URLSearchParams({
    q: query,
    api_key: BARIKOI_API_KEY,
    city: "dhaka",
    sub_area: "true",
    sub_district: "true",
  });
  if (lat !== undefined && lng !== undefined) {
    params.set("latitude", String(lat));
    params.set("longitude", String(lng));
  }
  return `https://barikoi.xyz/v2/api/search/autocomplete/place?${params}`;
}

// Helper: construct Barikoi place details URL (v2)
export function getBarikoiPlaceDetailUrl(placeId: string): string {
  return `https://barikoi.xyz/v2/api/search/details/place?api_key=${BARIKOI_API_KEY}&place_id=${placeId}`;
}

// Helper: construct Barikoi reverse geocode URL (v2)
export function getBarikoiReverseGeocodeUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    api_key: BARIKOI_API_KEY,
    longitude: String(lng),
    latitude: String(lat),
    district: "true",
    post_code: "true",
    country: "true",
    sub_district: "true",
    union: "true",
    pauroshova: "true",
    location_type: "true",
    division: "true",
    address: "true",
    area: "true",
    bangla: "true",
  });
  return `https://barikoi.xyz/v2/api/search/reverse/geocode?${params}`;
}

// Helper: construct Barikoi directions URL (v2)
export function getBarikoiDirectionsUrl(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): string {
  return `https://barikoi.xyz/v2/api/route/${originLng},${originLat};${destLng},${destLat}?api_key=${BARIKOI_API_KEY}&geometries=polyline`;
}

// Helper: construct Barikoi distance matrix URL (v2)
export function getBarikoiDistanceMatrixUrl(
  origins: { lat: number; lng: number }[],
  destinations: { lat: number; lng: number }[],
): string {
  const src = origins.map((o) => `${o.lng},${o.lat}`).join("|");
  const dst = destinations.map((d) => `${d.lng},${d.lat}`).join("|");
  return `https://barikoi.xyz/v2/api/distance/matrix?api_key=${BARIKOI_API_KEY}&src=${src}&dst=${dst}`;
}

// MapLibre-friendly coordinate order: [longitude, latitude] (GeoJSON)
// react-native-maps uses {latitude, longitude} — convert when needed
export function toGeoJsonCoord(lat: number, lng: number): [number, number] {
  return [lng, lat];
}
