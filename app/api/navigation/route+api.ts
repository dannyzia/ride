import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

const routeSchema = z.object({
  waypoints: z.array(z.object({ lat: z.number(), lng: z.number() })).min(2).max(25),
});

export async function POST(request: Request) {
  try {
    await verifySupabaseToken(request);
    const parsed = await parseJsonBody(request, routeSchema);
    if (!parsed.ok) return parsed.response;

    const { waypoints } = parsed.data;
    const apiKey = process.env.EXPO_PUBLIC_BARIKOI_API_KEY;
    if (!apiKey) return Response.json({ error: 'config_missing', message: 'Configuration missing' }, { status: 500 });

    const from = `${waypoints[0].lng},${waypoints[0].lat}`;
    const to = `${waypoints[waypoints.length - 1].lng},${waypoints[waypoints.length - 1].lat}`;
    const url = `https://barikoi.xyz/v1/api/distance/directions/${apiKey}?from=${from}&to=${to}`;

    const res = await fetch(url);
    const data = await res.json();

    return Response.json({
      route: {
        duration_seconds: data.duration ?? 0,
        distance_meters: data.distance ?? 0,
        geometry: data.geometry ?? null,
        steps: data.steps ?? [],
      },
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[navigation/route] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
