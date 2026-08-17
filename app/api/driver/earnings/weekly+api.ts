import { db } from "@/src/db";
import { rides, users, drivers } from "@/src/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { nextBdtMidnightUtc, prevBdtMidnightUtc } from "@/lib/time";
import * as errors from "@/lib/errors";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Last 7 Asia/Dhaka days of driver earnings (today included), oldest first.
 * Each day is bucketised by the Dhaka calendar date of completed_at, so a
 * trip completed after 00:00 BDT lands on the new day regardless of server tz.
 * Days with no completed trips are zero-filled so the client can render a
 * continuous week.
 */
export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found", message: "Driver not found" }, { status: 404 });

    const weekEnd = nextBdtMidnightUtc();
    const weekStart = new Date(prevBdtMidnightUtc().getTime() - 6 * DAY_MS);

    const rows = await db.select({
      day: sql<string>`TO_CHAR(${rides.completed_at} AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD')`,
      earnings_bdt: sql<number>`COALESCE(SUM(${rides.driver_fare_bdt}), 0) + COALESCE(SUM(${rides.tip_bdt}), 0)`,
      trips: sql<number>`COUNT(*)`,
    })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        eq(rides.status, "completed"),
        gte(rides.completed_at, weekStart),
        lt(rides.completed_at, weekEnd),
      ))
      .groupBy(sql`TO_CHAR(${rides.completed_at} AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD')`)
      .orderBy(sql`1`);

    const byDay = new Map<string, { earnings_bdt: number; trips: number }>();
    for (const r of rows) {
      byDay.set(r.day, { earnings_bdt: Number(r.earnings_bdt ?? 0), trips: Number(r.trips ?? 0) });
    }

    // weekStart is UTC midnight of a Dhaka day, so its UTC date parts are the
    // Dhaka date parts — no tz conversion needed when building the 7 keys.
    const days: { date: string; earnings_bdt: number; trips: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(weekStart.getTime() + i * DAY_MS);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const row = byDay.get(key);
      days.push({ date: key, earnings_bdt: row?.earnings_bdt ?? 0, trips: row?.trips ?? 0 });
    }

    return Response.json({ days }, { status: 200 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    logger.error("[driver/earnings/weekly] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
