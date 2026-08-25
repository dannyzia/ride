// Phase G: rider post-cancellation survey for driver-cancelled rides.
//
// One survey per ride — enforced by the cancel_surveys.ride_id unique
// index (onConflictDoNothing → 409 on the second attempt). A
// `completed: true` answer is strong off-platform-completion evidence:
// it is appended (never overwrites) to any OPEN off_platform_completion
// fraud flag for that ride's driver, inside the same transaction as the
// survey insert.
import { db } from '@/src/db';
import { rides, users, cancelSurveys, fraudFlags } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import * as errors from '@/lib/errors';

const surveySchema = z.object({
  completed: z.boolean(),
});

/** Narrow unknown jsonb evidence to a spreadable record (never throws). */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });
    }
    const rideId = id;

    const user = await verifySupabaseToken(request);

    const parsed = await parseJsonBody(request, surveySchema);
    if (!parsed.ok) return parsed.response;
    const { completed } = parsed.data;

    const [dbUser] = await db.select().from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    // Rider-owned only — drivers and other users get 403.
    if (ride.user_id !== dbUser.id) {
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    }

    // Surveys exist only for rides the DRIVER cancelled.
    if (ride.status !== 'cancelled' || ride.cancelled_by !== 'driver') {
      return Response.json(
        { error: 'ride_not_driver_cancelled', message: 'A survey is only available for rides cancelled by the driver' },
        { status: 422 },
      );
    }

    let surveyInserted = false;
    let flagUpdated = false;
    await db.transaction(async (tx) => {
      // cancel_surveys.ride_id unique index = once-per-ride idempotency.
      const inserted = await tx.insert(cancelSurveys)
        .values({ ride_id: rideId, rider_id: dbUser.id, completed })
        .onConflictDoNothing({ target: cancelSurveys.ride_id })
        .returning({ id: cancelSurveys.id });

      if (inserted.length === 0) return; // already surveyed — 409 after the tx
      surveyInserted = true;

      if (!completed || !ride.driver_id) return;

      type FraudFlagRow = typeof fraudFlags.$inferSelect;

      // Match an OPEN off_platform_completion flag for this driver:
      // flag.ride_id = this ride first…
      const [byRideId] = await tx.select().from(fraudFlags).where(and(
        eq(fraudFlags.driver_id, ride.driver_id),
        eq(fraudFlags.flag_type, 'off_platform_completion'),
        eq(fraudFlags.status, 'open'),
        eq(fraudFlags.ride_id, rideId),
      )).limit(1);

      let flag: FraudFlagRow | null = byRideId ?? null;

      // …then any other open flag whose evidence jsonb references this ride.
      if (!flag) {
        const openFlags = await tx.select().from(fraudFlags).where(and(
          eq(fraudFlags.driver_id, ride.driver_id),
          eq(fraudFlags.flag_type, 'off_platform_completion'),
          eq(fraudFlags.status, 'open'),
        ));
        flag = openFlags.find((f) => JSON.stringify(f.evidence ?? null).includes(rideId)) ?? null;
      }

      if (!flag) return;

      // Append (merge) — never overwrite existing evidence.
      const evidence = {
        ...asRecord(flag.evidence),
        cancel_survey_completed: true,
        survey_ride_id: rideId,
        surveyed_at: new Date().toISOString(),
      };

      await tx.update(fraudFlags)
        .set({ evidence, updated_at: new Date() })
        .where(eq(fraudFlags.id, flag.id));

      flagUpdated = true;
    });

    if (!surveyInserted) {
      return Response.json(
        { error: 'survey_already_submitted', message: 'A survey has already been submitted for this ride' },
        { status: 409 },
      );
    }

    logger.info('[ride/cancel-survey] survey recorded', { rideId, riderId: dbUser.id, completed, flagUpdated });

    return Response.json({ ok: true, flag_updated: flagUpdated });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[ride/cancel-survey] error', e);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
