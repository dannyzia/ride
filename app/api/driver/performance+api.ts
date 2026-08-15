import { db } from "@/src/db";
import { rides, users, drivers, driverOnlineSessions } from "@/src/db/schema";
import { eq, and, gte, sql, count } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select()
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [weekTripsRow] = await db.select({ cnt: count() })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        eq(rides.status, "completed"),
        gte(rides.completed_at, weekStart),
      ));

    const [monthTripsRow] = await db.select({ cnt: count() })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        eq(rides.status, "completed"),
        gte(rides.completed_at, monthStart),
      ));

    const [cancelledRow] = await db.select({ cnt: count() })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        eq(rides.status, "cancelled"),
      ));

    const [totalAssignedRow] = await db.select({ cnt: count() })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        sql`status IN ('completed', 'cancelled')`,
      ));

    const [onlineRow] = await db.select({
      total_minutes: sql<number>`COALESCE(SUM(duration_minutes), 0)`,
    })
      .from(driverOnlineSessions)
      .where(and(
        eq(driverOnlineSessions.driver_id, driver.id),
        gte(driverOnlineSessions.went_online_at, weekStart),
      ));

    const totalAssigned = totalAssignedRow?.cnt ?? 0;
    const cancelledCount = cancelledRow?.cnt ?? 0;
    const cancellationRate = totalAssigned > 0 ? (cancelledCount / totalAssigned) * 100 : 0;
    const onlineHours = Number(onlineRow?.total_minutes ?? 0) / 60;

    return Response.json({
      acceptance_rate: parseFloat(String(driver.acceptance_rate ?? "100")) * 1,
      cancellation_rate: Math.round(cancellationRate * 100) / 100,
      rating: parseFloat(String(driver.rating ?? "5.00")),
      trips_this_week: weekTripsRow?.cnt ?? 0,
      trips_this_month: monthTripsRow?.cnt ?? 0,
      online_hours: Math.round(onlineHours * 10) / 10,
    }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/performance] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
