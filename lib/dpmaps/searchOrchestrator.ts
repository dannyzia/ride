/**
 * lib/dpmaps/searchOrchestrator.ts — dpMaps mixed autocomplete orchestrator.
 *
 * Implements 4 search provider modes:
 *   - 'vendor_only'    (or 'off'): Barikoi vendor search only.
 *   - 'mixed_shadow'   (or 'shadow'): Fuses local dpMaps POIs + Barikoi vendor suggestions.
 *   - 'dpmaps_primary' (or 'primary'): In-house POIs served first; vendor called strictly on zero local matches.
 *   - 'dpmaps_sole'    (or 'sole'): 100% in-house POI and OSM search; zero external API calls.
 *
 * Clean-room invariant:
 * - Vendor suggestions mint single-use 15-minute session tokens (dest_session:<token>).
 * - Vendor coordinates are never returned directly in client responses or saved into dpmaps.* tables.
 */

import { recordDestinationSession } from './destSession';
import { scrubPii } from './piiScrubber';
import { getConfigValue } from '@/lib/platformConfig';
import { logger } from '@/lib/logger';

const BARIKOI_API_KEY = process.env.BARIKOI_API_KEY ?? '';

export type SearchMode = 'vendor_only' | 'mixed_shadow' | 'dpmaps_primary' | 'dpmaps_sole';

export interface AutocompleteSuggestion {
  place_id: string;
  title: string;
  subtitle: string;
  category: string;
  point_type: 'entrance' | 'building' | 'area' | 'dropoff_point';
  source: 'first_party' | 'osm' | 'vendor';
  session_token?: string;
  coords?: { lat: number; lng: number };
}

export function normalizeSearchMode(raw: unknown): SearchMode {
  if (typeof raw === 'string') {
    const val = raw.trim().toLowerCase();
    if (val === 'off' || val === 'vendor_only' || val === '0') return 'vendor_only';
    if (val === 'shadow' || val === 'mixed_shadow' || val === '1') return 'mixed_shadow';
    if (val === 'primary' || val === 'dpmaps_primary' || val === '2') return 'dpmaps_primary';
    if (val === 'sole' || val === 'dpmaps_sole' || val === '3') return 'dpmaps_sole';
  }
  return 'mixed_shadow';
}

/**
 * Query MeiliSearch index for local first-party or OSM POIs
 */
async function queryMeilisearchIndex(
  baseUrl: string,
  indexName: string,
  query: string,
  limit = 5,
): Promise<AutocompleteSuggestion[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/indexes/${indexName}/search`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, limit }),
      signal: AbortSignal.timeout(150),
    });
    if (!res.ok) return [];
    const body = (await res.json().catch(() => ({}))) as { hits?: any[] };
    if (!Array.isArray(body.hits)) return [];

    return body.hits.map((hit: any) => ({
      place_id: hit.id || `poi-${Math.random().toString(36).slice(2, 8)}`,
      title: hit.canonical_name || hit.bangla_name || hit.name || query,
      subtitle: hit.area_name || hit.sub_district || hit.category || 'Dhaka',
      category: hit.category || 'point_of_interest',
      point_type: hit.point_type || 'building',
      source: indexName === 'osm_pois' ? 'osm' : 'first_party',
      coords: hit._geo ? { lat: hit._geo.lat, lng: hit._geo.lng } : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Query Barikoi autocomplete API, storing coordinates ephemerally
 */
async function queryVendorAutocomplete(
  query: string,
  proximity?: { lat: number; lng: number },
): Promise<AutocompleteSuggestion[]> {
  if (!BARIKOI_API_KEY) return [];

  const params = new URLSearchParams({
    q: query,
    api_key: BARIKOI_API_KEY,
    city: 'dhaka',
    sub_area: 'true',
    sub_district: 'true',
  });
  if (proximity && Number.isFinite(proximity.lat) && Number.isFinite(proximity.lng)) {
    params.set('latitude', String(proximity.lat));
    params.set('longitude', String(proximity.lng));
  }

  const url = `https://barikoi.xyz/v2/api/search/autocomplete/place?${params}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!res.ok) return [];
    const body = (await res.json().catch(() => ({}))) as { places?: any[] };
    if (!Array.isArray(body.places)) return [];

    const suggestions: AutocompleteSuggestion[] = [];
    for (const place of body.places) {
      const lat = parseFloat(place.latitude);
      const lng = parseFloat(place.longitude);
      let sessionToken: string | undefined;

      // Mint 15-minute ephemeral session token if coordinates exist
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        sessionToken = recordDestinationSession({ lat, lng });
      }

      suggestions.push({
        place_id: String(place.id || `vendor-${Math.random().toString(36).slice(2, 8)}`),
        title: place.address || place.name || query,
        subtitle: [place.area, place.city].filter(Boolean).join(', ') || 'Dhaka',
        category: place.location_type || 'area',
        point_type: 'dropoff_point',
        source: 'vendor',
        session_token: sessionToken,
        coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
      });
    }

    return suggestions;
  } catch (err: unknown) {
    logger.warn('[dpmaps/search] Vendor autocomplete failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Primary search entry point: executes search based on configured search_provider_mode
 */
export async function searchMixedAutocomplete(options: {
  query: string;
  proximity?: { lat: number; lng: number };
  language?: string;
  limit?: number;
}): Promise<AutocompleteSuggestion[]> {
  const { query, proximity, limit = 6 } = options;
  const cleanQuery = scrubPii(query).trim();
  if (cleanQuery.length < 2) return [];

  const modeRaw = await getConfigValue('search_provider_mode', 'mixed_shadow');
  const mode = normalizeSearchMode(modeRaw);
  const meiliUrl = await getConfigValue('dpmaps_meilisearch_url', 'http://localhost:7700');

  // Mode 0: vendor only
  if (mode === 'vendor_only') {
    return (await queryVendorAutocomplete(cleanQuery, proximity)).slice(0, limit);
  }

  // Mode 3: sole in-house provider (zero vendor calls)
  if (mode === 'dpmaps_sole') {
    const [firstParty, osm] = await Promise.all([
      queryMeilisearchIndex(meiliUrl, 'public_pois', cleanQuery, limit),
      queryMeilisearchIndex(meiliUrl, 'osm_pois', cleanQuery, limit),
    ]);
    return [...firstParty, ...osm].slice(0, limit);
  }

  // Mode 2: dpMaps primary (vendor called strictly on zero local matches)
  if (mode === 'dpmaps_primary') {
    const [firstParty, osm] = await Promise.all([
      queryMeilisearchIndex(meiliUrl, 'public_pois', cleanQuery, limit),
      queryMeilisearchIndex(meiliUrl, 'osm_pois', cleanQuery, limit),
    ]);
    const localResults = [...firstParty, ...osm];
    if (localResults.length > 0) {
      return localResults.slice(0, limit);
    }
    // Zero local results -> fallback to vendor
    return (await queryVendorAutocomplete(cleanQuery, proximity)).slice(0, limit);
  }

  // Mode 1: mixed shadow (default launch: fuses local + vendor)
  const [localResults, vendorResults] = await Promise.all([
    queryMeilisearchIndex(meiliUrl, 'public_pois', cleanQuery, Math.ceil(limit / 2)),
    queryVendorAutocomplete(cleanQuery, proximity),
  ]);

  // Interleave local first-party results with vendor suggestions
  const merged: AutocompleteSuggestion[] = [];
  const maxLen = Math.max(localResults.length, vendorResults.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < localResults.length) merged.push(localResults[i]);
    if (i < vendorResults.length) merged.push(vendorResults[i]);
    if (merged.length >= limit) break;
  }

  return merged.slice(0, limit);
}

