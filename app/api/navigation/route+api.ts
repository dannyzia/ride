import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import * as errors from '@/lib/errors';
const routeSchema = z.object({
  waypoints: z.array(z.object({ lat: z.number(), lng: z.number() })).min(2).max(25),
});

export async function POST(request: Request) {
  try {
    await verifySupabaseToken(request);
    const parsed = await parseJsonBody(request, routeSchema);
    if (!parsed.ok) return parsed.response;

    const { waypoints } = parsed.data;
    // Server-side key (consistent with lib/barikoi.ts, lib/routeSplit.ts) —
    // the EXPO_PUBLIC_ prefixed read this file previously used was a
    // client-variable leak into a server route (plan Batch 6.1).
    const apiKey = process.env.BARIKOI_API_KEY;
    if (!apiKey) return Response.json({ error: 'config_missing', message: 'Configuration missing' }, { status: 500 });

    const from = `${waypoints[0].lng},${waypoints[0].lat}`;
    const to = `${waypoints[waypoints.length - 1].lng},${waypoints[waypoints.length - 1].lat}`;
    // Barikoi v2 route API (Batch 6 of the Barikoi optimization plan;
    // probe artifact 2026-09-14 in .kilo/plans/active-lanes.md). The old v1
    // distance/directions endpoint is dead (404 HTML — same precedent as
    // lib/routeSplit.ts). geometries=geojson because DriverNavigation feeds
    // route.geometry straight into MapLibre ShapeSource.shape (GeoJSON-typed
    // prop — a polyline string would silently break the route line, plan D-D).
    // steps=true for turn-by-turn instructions (FEATURES.md row 25).
    const url = `https://barikoi.xyz/v2/api/route/${from};${to}?api_key=${apiKey}&geometries=geojson&steps=true`;

    const res = await fetch(url);
    const data = await res.json();
    // OSRM-shape response: gate on code==='Ok' + routes[0] (mirrors lib/barikoi.ts).
    if (data.code !== 'Ok' || !data.routes?.length) {
      logger.error('[navigation/route] Barikoi v2 non-Ok response', { code: data.code });
      return Response.json({ error: 'route_unavailable', message: 'Route could not be calculated' }, { status: 502 });
    }
    const route = data.routes[0];

    return Response.json({
      route: {
        duration_seconds: route.duration ?? 0,
        distance_meters: route.distance ?? 0,
        // GeoJSON LineString object — unchanged client shape (ShapeSource-ready).
        geometry: route.geometry ?? null,
        steps: (route.legs?.[0]?.steps ?? []).map((step: { maneuver?: { instruction?: string }; distance?: number }) => ({
          instruction: step.maneuver?.instruction ?? '',
          distance: step.distance ?? 0,
        })),
      },
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[navigation/route] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
