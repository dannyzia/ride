import { db } from '@/src/db';
import { rides, users, drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { evaluateCancellation, applyCancellationFee } from '@/lib/cancellation';
import { recordCancellationFee } from '@/lib/accounting';

const cancelSchema = z.object({
  reason: z.string().max(255).optional(),
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

    const { reason } = parsed.data;

    const [dbUser] = await db.select().from(users).where(eq(users.auth_uid, _user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found' }, { status: 404 });

    // Verify ownership for rider/driver cancellations
    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });

    if (ride.user_id !== dbUser.id) {
      const [driver] = await db.select({ id: drivers.id }).from(drivers)
        .where(eq(drivers.user_id, dbUser.id)).limit(1);
      if (!driver || ride.driver_id !== driver.id) {
        return Response.json({ error: 'forbidden' }, { status: 403 });
      }
    }

    // Derive cancelled_by server-side from role
    const cancelled_by = dbUser.role === 'driver' ? 'driver' : 'rider';

    // Only allow cancellation of pending/dispatching/matched/driver_arriving/driver_arrived rides
    if (!['pending', 'dispatching', 'matched', 'driver_arriving', 'driver_arrived'].includes(ride.status)) {
      return Response.json({ error: 'ride_not_cancellable', message: `Cannot cancel ride in status: ${ride.status}` }, { status: 409 });
    }

    // Evaluate and apply cancellation fee
    const { feeBdt } = await evaluateCancellation(rideId, cancelled_by as 'rider' | 'driver');
    await applyCancellationFee(rideId, feeBdt);

    // ── Accounting entry (non-blocking) ──────────────────────────────────
    if (feeBdt > 0) {
      try { await recordCancellationFee({ id: rideId, feePaisa: feeBdt, riderId: ride.user_id }); }
      catch (e) { logger.warn('[accounting] cancellation fee entry failed', e); }
    }

    await db.update(rides).set({
      status: 'cancelled',
      cancelled_by,
      cancel_reason: reason ?? null,
      cancellation_fee_bdt: feeBdt > 0 ? feeBdt : undefined,
    }).where(eq(rides.id, rideId));

    // Free the assigned driver if this cancelled ride had one
    if (ride.driver_id) {
      await db.update(drivers)
        .set({ is_online: true, updated_at: new Date() })
        .where(eq(drivers.id, ride.driver_id));
    }

    logger.info('[ride/cancel] ride cancelled', { rideId, cancelled_by, reason });

    return Response.json({ ok: true, status: 'cancelled' });
  } catch (e: any) {
    if (e.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
