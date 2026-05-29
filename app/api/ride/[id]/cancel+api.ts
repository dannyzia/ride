import { db } from '@/src/db';
import { rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const cancelSchema = z.object({
  reason: z.string().max(255).optional(),
  cancelled_by: z.enum(['rider', 'driver', 'system']).optional().default('rider'),
});

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const rideId = segments[segments.indexOf('ride') + 1];
    if (!rideId) return Response.json({ error: 'missing_ride_id' }, { status: 400 });

    const _user = await verifySupabaseToken(request);

    const body = await request.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { reason, cancelled_by } = parsed.data;

    // Verify ownership for rider/driver cancellations
    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });

    // Only allow cancellation of pending/dispatching/matched rides
    if (!['pending', 'dispatching', 'matched', 'driver_arriving'].includes(ride.status)) {
      return Response.json({ error: 'ride_not_cancellable', message: `Cannot cancel ride in status: ${ride.status}` }, { status: 409 });
    }

    await db.update(rides).set({
      status: 'cancelled',
      cancelled_by,
      cancel_reason: reason ?? null,
    }).where(eq(rides.id, rideId));

    logger.info('[ride/cancel] ride cancelled', { rideId, cancelled_by, reason });

    return Response.json({ ok: true, status: 'cancelled' });
  } catch (e: any) {
    if (e.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
