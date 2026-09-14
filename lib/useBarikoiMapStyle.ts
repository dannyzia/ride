const BARIKOI_API_KEY = process.env.EXPO_PUBLIC_BARIKOI_API_KEY ?? "";

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
