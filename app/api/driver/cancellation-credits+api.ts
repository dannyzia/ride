import { db } from "@/src/db";
import { users, drivers, cancellationCredits } from "@/src/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser)
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    if (dbUser.role !== "driver")
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!driver)
      return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const credits = await db
      .select({
        id: cancellationCredits.id,
        original_driver_id: cancellationCredits.original_driver_id,
        cancellation_ride_id: cancellationCredits.cancellation_ride_id,
        amount_bdt: cancellationCredits.amount_bdt,
        status: cancellationCredits.status,
        applied_to_ride_id: cancellationCredits.applied_to_ride_id,
        applied_at: cancellationCredits.applied_at,
        expires_at: cancellationCredits.expires_at,
        created_at: cancellationCredits.created_at,
      })
      .from(cancellationCredits)
      .where(eq(cancellationCredits.original_driver_id, driver.id))
      .orderBy(desc(cancellationCredits.created_at));

    return Response.json({
      credits: credits.map((c) => ({
        id: c.id,
        amount_bdt: c.amount_bdt,
        status: c.status,
        applied_to_ride_id: c.applied_to_ride_id,
        applied_at: c.applied_at?.toISOString() ?? null,
        expires_at: c.expires_at.toISOString(),
        created_at: c.created_at.toISOString(),
      })),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/cancellation-credits] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
