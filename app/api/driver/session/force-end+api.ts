import { db } from '@/src/db';
import { driverOnlineSessions, drivers, users } from '@/src/db/schema';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { eq, and, isNull } from 'drizzle-orm';
import * as errors from '@/lib/errors';

/**
 * POST /api/driver/session/force-end
 *
 * Force-closes all open driver_online_sessions for the authenticated driver.
 * Used by the recovery flow when a zombie session is detected (app crash /
 * OS kill left went_offline_at as NULL).
 *
 * Also resets drivers.is_online and drivers.on_break.
 */
export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) {
      return Response.json(
        { error: 'user_not_found', message: 'User not found' },
        { status: 404 },
      );
    }

    const [driver] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver) {
      return Response.json(
        { error: 'driver_not_found', message: 'Driver not found' },
        { status: 404 },
      );
    }

    // Find all open sessions (went_offline_at IS NULL)
    const openSessions = await db
      .select()
      .from(driverOnlineSessions)
      .where(
        and(
          eq(driverOnlineSessions.driver_id, driver.id),
          isNull(driverOnlineSessions.went_offline_at),
        ),
      );

    const now = new Date();

    for (const session of openSessions) {
      const durationMinutes = session.went_online_at
        ? Math.max(
            0,
            Math.round(
              (now.getTime() - new Date(session.went_online_at).getTime()) /
                60_000,
            ),
          )
        : 0;

      await db
        .update(driverOnlineSessions)
        .set({
          went_offline_at: now,
          duration_minutes: durationMinutes,
        })
        .where(eq(driverOnlineSessions.id, session.id));
    }

    // Reset driver state
    await db
      .update(drivers)
      .set({
        is_online: false,
        on_break: false,
        break_started_at: null,
        updated_at: now,
      })
      .where(eq(drivers.id, driver.id));

    logger.info('[driver/session/force-end] sessions closed', {
      userId: user.id,
      count: openSessions.length,
    });

    return Response.json({
      success: true,
      ended: openSessions.length > 0,
      count: openSessions.length,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    logger.error('[driver/session/force-end] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
