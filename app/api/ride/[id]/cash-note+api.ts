// C3-5 (STAGE C3-FIX, F-05 cash handshake): the rider notes the cash they
// will hand over (change-making) while the ride is in_progress. The driver
// sees it before completing; the driver confirms the amount actually
// received at complete, and both sides land in the receipt. Integer paisa.
import { db } from '@/src/db';
import { rides, drivers } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { sendNotification } from '@/lib/notify';
import { notifyWs } from '@/lib/wsNotify';
import { z } from 'zod';
import * as errors from '@/lib/errors';

// Sanity cap: ৳100,000 in paisa. Generous on purpose — real fares must
// never trip it; it only rejects junk/overflow input.
const MAX_CASH_TENDERED_BDT = 10_000_000;

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid ride ID' }, { status: 400 });
    }
    const rideId = id;

    const { dbUser: user } = await requireRole('rider')(request);

    const bodyParsed = await parseJsonBody(
      request,
      z.object({ cash_tendered_bdt: z.number().int().min(0).max(MAX_CASH_TENDERED_BDT) }),
    );
    if (!bodyParsed.ok) return bodyParsed.response;
    const { cash_tendered_bdt } = bodyParsed.data;

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.user_id !== user.id) {
      return Response.json({ error: 'not_your_ride', message: 'This ride does not belong to you' }, { status: 403 });
    }

    // F-05 order: the note precedes the driver's cash confirmation, so it
    // is only writable while the ride is in_progress. Atomic gate — a
    // concurrent complete landing first yields 409, not a lost note.
    const now = new Date();
    const [noted] = await db.update(rides)
      .set({ rider_cash_tendered_bdt: cash_tendered_bdt, rider_cash_noted_at: now, updated_at: now })
      .where(and(eq(rides.id, rideId), eq(rides.status, 'in_progress')))
      .returning({ id: rides.id, driver_id: rides.driver_id });
    if (!noted) {
      return Response.json({
        error: 'invalid_status',
        message: `Cannot note cash in status: ${ride.status}`,
      }, { status: 409 });
    }

    logger.info('[ride/cash-note] rider noted cash tendered', { rideId, cash_tendered_bdt });

    // Fan out to the driver (fire-and-forget, after commit): WS event +
    // push. Either channel failing must not fail the committed note.
    if (noted.driver_id) {
      const [driverUser] = await db.select({ user_id: drivers.user_id })
        .from(drivers)
        .where(eq(drivers.id, noted.driver_id))
        .limit(1);
      if (driverUser) {
        notifyWs([{
          event: 'ride:cash_noted',
          to: [{ kind: 'user', user_id: driverUser.user_id }],
          payload: { ride_id: rideId, cash_tendered_bdt },
        }]);
        sendNotification(
          driverUser.user_id,
          'ride:cash_noted',
          'Rider noted cash',
          'The rider noted the cash they will hand over. Check the ride for the amount.',
          { ride_id: rideId },
        ).catch(() => {});
      }
    }
    return Response.json({
      ok: true,
      ride_id: rideId,
      cash_tendered_bdt,
      noted_at: now.toISOString(),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401 || errors.getErrorStatus(err) === 403) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: errors.getErrorStatus(err) ?? 500 });
    }
    logger.error('[ride/cash-note] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
