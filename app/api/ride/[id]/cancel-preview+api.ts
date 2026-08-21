import { evaluateCancellation } from '@/lib/cancellation';
import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { toUtcIso } from '@/lib/time';
import { getPlan05Int } from '@/lib/platformConfig';
import * as errors from '@/lib/errors';

/**
 * §1.3 server-authoritative cancellation preview.
 * Returns:
 *   fee_bdt        — integer paisa cancellation fee (0 if within grace)
 *   free_until      — ISO timestamp until which cancellation is free
 *   server_now      — current server time (client binds countdown to this)
 *   policy          — active policy name or "within_grace_period"
 *   ride_status     — current ride status (client-side guard)
 *   reason_required — whether a cancel reason is mandatory
 */
export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    // M-31: the cancellation preview exposes fee state for a ride — it must
    // only be readable by the ride's rider.
    const [ride] = await db
      .select({ user_id: rides.user_id, status: rides.status, created_at: rides.created_at })
      .from(rides)
      .where(eq(rides.id, id))
      .limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.user_id !== user.id) {
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    }

    // Read grace period from platform_config (fresh read, never cached)
    const graceSeconds = await getPlan05Int('cancel_grace_period_seconds');

    const { feeBdt, reason } = await evaluateCancellation(id, 'rider');

    const serverNow = new Date();
    const rideCreated = new Date(ride.created_at);
    const freeUntilMs = rideCreated.getTime() + graceSeconds * 1000;
    const freeUntil = new Date(freeUntilMs);

    // Reason is required when a fee applies (fee > 0)
    const reasonRequired = feeBdt > 0;

    return Response.json({
      fee_bdt: feeBdt,
      free_until: toUtcIso(freeUntil),
      server_now: toUtcIso(serverNow),
      policy: reason,
      ride_status: ride.status,
      reason_required: reasonRequired,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[cancel-preview] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
