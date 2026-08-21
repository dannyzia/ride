import { db } from "@/src/db";
import { rides, users, drivers } from "@/src/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, user.id))
      .limit(1);
    if (!dbUser)
      return Response.json(
        { error: "user_not_found", message: "User not found" },
        { status: 404 },
      );

    const [driver] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!driver)
      return Response.json(
        { error: "driver_not_found", message: "Driver not found" },
        { status: 404 },
      );

    // Parse optional week_offset (0 = current week, 1 = last week, etc.)
    const url = new URL(request.url);
    const weekOffsetParam = url.searchParams.get("week_offset");
    const weekOffset = weekOffsetParam
      ? Math.max(0, Math.min(52, parseInt(weekOffsetParam, 10) || 0))
      : 0;

    const now = new Date();
    const weekEnd = new Date(now.getTime() - weekOffset * WEEK_MS);
    const weekStart = new Date(weekEnd.getTime() - WEEK_MS);

    const tripRows = await db
      .select({
        ride_id: rides.id,
        completed_at: rides.completed_at,
        totalBdt: sql<string>`COALESCE(CAST(fare_breakdown->>'total_bdt' AS bigint), 0)`,
        commissionBdt: rides.platform_commission_bdt,
      })
      .from(rides)
      .where(
        and(
          eq(rides.driver_id, driver.id),
          eq(rides.status, "completed"),
          gte(rides.completed_at, weekStart),
          lt(rides.completed_at, weekEnd),
        ),
      )
      .orderBy(sql`completed_at DESC`)
      .limit(200);

    const trips = tripRows.map((r) => {
      const totalFare = Number(r.totalBdt ?? 0);
      const commission = r.commissionBdt ?? 0;
      return {
        ride_id: r.ride_id,
        completed_at: r.completed_at?.toISOString() ?? "",
        total_fare_bdt: totalFare,
        commission_bdt: commission,
        driver_net_bdt: totalFare - commission,
      };
    });

    const totalEarnings = trips.reduce((acc, t) => acc + t.total_fare_bdt, 0);
    const commissionCharged = trips.reduce(
      (acc, t) => acc + t.commission_bdt,
      0,
    );

    return Response.json(
      {
        week_start: weekStart.toISOString(),
        week_end: weekEnd.toISOString(),
        total_earnings_bdt: totalEarnings,
        commission_rate_percent:
          totalEarnings > 0
            ? Math.round((commissionCharged / totalEarnings) * 10000) / 100
            : 0,
        commission_charged_bdt: commissionCharged,
        driver_net_bdt: totalEarnings - commissionCharged,
        trips,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    logger.error("[driver/commission-statement] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
