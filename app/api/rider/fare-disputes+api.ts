import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, fareDisputes, rides } from '@/src/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { autoArbitrateDispute } from '@/lib/fareArbitration';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const disputeSchema = z.object({
  ride_id: z.string().uuid(),
  claimed_fare_bdt: z.number().int().positive().max(5_000_000), // paisa; cap matches topupSchema bounds
  dispute_reason: z.enum(['route_longer', 'wrong_vehicle', 'wait_fee_unfair', 'other']),
  rider_note: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [rider] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!rider) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, disputeSchema);
    if (!parsed.ok) return parsed.response;

    const [ride] = await db.select().from(rides).where(eq(rides.id, parsed.data.ride_id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.user_id !== rider.id) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    if (!ride.completed_at || Date.now() - new Date(ride.completed_at).getTime() > 172800000) {
      return Response.json({ error: 'dispute_window_expired', message: 'Fares can only be disputed within 48 hours' }, { status: 422 });
    }

    // fare_disputes.driver_id is NOT NULL — a completed ride must have a driver on record.
    if (!ride.driver_id) return Response.json({ error: 'ride_not_disputable', message: 'No driver on record for this ride' }, { status: 422 });
    // Narrowed outside the tx closure (TS resets property narrowing inside callbacks)
    const driverId = ride.driver_id;

    // M-30: insert + auto-arbitration are ONE transaction — a failure during
    // arbitration can no longer leave a stuck 'pending' dispute behind. The
    // advisory lock serializes concurrent submissions for the same ride so
    // the duplicate check can't be passed twice (double-refund vector).
    let disputeId = "";
    let resolution = "pending";
    let refundBdt = 0;
    let duplicate = false;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('fare_dispute_' || ${parsed.data.ride_id}))`);

      const [existing] = await tx.select({ id: fareDisputes.id }).from(fareDisputes)
        .where(eq(fareDisputes.ride_id, parsed.data.ride_id)).limit(1);
      if (existing) {
        duplicate = true;
        return;
      }

      const [dispute] = await tx.insert(fareDisputes).values({
        ride_id: parsed.data.ride_id,
        rider_id: rider.id,
        driver_id: driverId,
        claimed_fare_bdt: parsed.data.claimed_fare_bdt,
        charged_fare_bdt: ride.rider_payable_bdt ?? ride.driver_fare_bdt ?? 0,
        dispute_reason: parsed.data.dispute_reason,
        rider_note: parsed.data.rider_note,
        // actual/estimated distance stay NULL — no real tracking exists (see lib/fareArbitration.ts).
      }).returning();

      const result = await autoArbitrateDispute(dispute.id, tx);
      disputeId = dispute.id;
      resolution = result.resolution;
      refundBdt = result.refund_bdt;
    });

    if (duplicate) {
      return Response.json({ error: 'duplicate_dispute', message: 'A dispute already exists for this ride' }, { status: 409 });
    }

    return Response.json({ dispute_id: disputeId, resolution, refund_bdt: refundBdt });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/fare-disputes] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [rider] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!rider) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const disputes = await db.select().from(fareDisputes)
      .where(eq(fareDisputes.rider_id, rider.id))
      .orderBy(desc(fareDisputes.created_at));

    return Response.json({ disputes });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/fare-disputes] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
