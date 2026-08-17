import { db } from "@/src/db";
import { rides, drivers, users } from "@/src/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const rows = await db.select({
      ride_id: rides.id,
      rating: rides.driver_rating,
      created_at: rides.completed_at,
    })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        isNotNull(rides.driver_rating),
      ))
      .orderBy(rides.completed_at)
      .limit(20);

    const [driverRow] = await db.select({
      rating: drivers.rating,
      rating_count: drivers.rating_count,
    }).from(drivers).where(eq(drivers.id, driver.id)).limit(1);

    const recent = rows.map((r) => ({
      ride_id: r.ride_id,
      rating: Number(r.rating),
      created_at: r.created_at?.toISOString() ?? new Date().toISOString(),
    }));

    return Response.json({
      average_rating: driverRow?.rating ? parseFloat(String(driverRow.rating)) : 0,
      rating_count: driverRow?.rating_count ?? 0,
      recent,
    }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/ratings] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
