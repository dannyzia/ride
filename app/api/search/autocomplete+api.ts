/**
 * app/api/search/autocomplete+api.ts
 *
 * Autocomplete & Search endpoint powered by dpMaps.
 * Fuses in-house MeiliSearch POI indexes with Barikoi vendor suggestions
 * and issues single-use session tokens (dest_session:<token>) for clean-room
 * coordinate resolution.
 */

import { searchMixedAutocomplete } from '@/lib/dpmaps/searchOrchestrator';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const latStr = url.searchParams.get('lat') || url.searchParams.get('latitude');
    const lngStr = url.searchParams.get('lng') || url.searchParams.get('longitude');
    const limitStr = url.searchParams.get('limit');

    if (!q || q.trim().length < 2) {
      return Response.json({ suggestions: [] });
    }

    const lat = latStr ? parseFloat(latStr) : undefined;
    const lng = lngStr ? parseFloat(lngStr) : undefined;
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 6, 20) : 6;

    const proximity =
      lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : undefined;

    const acceptLanguage = request.headers.get('accept-language') || '';
    const userLanguage = acceptLanguage.includes('bn') ? 'bn' : 'en';

    const results = await searchMixedAutocomplete({
      query: q,
      proximity,
      language: userLanguage,
      limit,
    });

    return Response.json({
      suggestions: results.map((item) => ({
        place_id: item.place_id,
        title: item.title,
        subtitle: item.subtitle,
        point_type: item.point_type,
        category: item.category,
        session_token: item.session_token,
      })),
    });
  } catch (err: unknown) {
    logger.error('[api/search/autocomplete] Autocomplete search error', err);
    return Response.json(
      { error: 'internal_error', message: 'Failed to search autocomplete suggestions' },
      { status: 500 },
    );
  }
}

