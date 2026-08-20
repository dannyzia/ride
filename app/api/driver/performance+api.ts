import { db } from "@/src/db";
import { rides, users, drivers, driverOnlineSessions } from "@/src/db/schema";
import { eq, and, gte, sql, count } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";

// §7.19 chart series — completed rides bucketed in Asia/Dhaka (L: timestamps
// are UTC timestamptz; Dhaka conversion happens only at display/bucketing).
interface SeriesRow {
  completed_at: Date | null;
  driver_fare_bdt: number | null;
  driver_rating: number | null;
}

const DHAKA_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  day: "numeric",
});
const DHAKA_WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  weekday: "short",
});
const DHAKA_DATE_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function buildSeries(period: "week" | "month", rows: SeriesRow[]) {
  if (period === "week") {
    // Rolling 7 Dhaka days (today inclusive) — empty days stay at 0.
    const byKey = new Map<string, { earn: number; ratingSum: number; ratingN: number; label: string }>();
    for (const r of rows) {
      if (!r.completed_at) continue;
      const key = DHAKA_DATE_KEY.format(r.completed_at);
      const b = byKey.get(key) ?? { earn: 0, ratingSum: 0, ratingN: 0, label: DHAKA_WEEKDAY.format(r.completed_at) };
      b.earn += r.driver_fare_bdt ?? 0;
      if (r.driver_rating !== null) { b.ratingSum += r.driver_rating; b.ratingN += 1; }
      byKey.set(key, b);
    }
    const expected: string[] = [];
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      expected.push(DHAKA_DATE_KEY.format(new Date(now - i * 86400000)));
    }
    const earnings_series = expected.map((k) => ({
      label: byKey.get(k)?.label ?? DHAKA_WEEKDAY.format(new Date(now)),
      value_bdt: byKey.get(k)?.earn ?? 0,
    }));
    const rating_series: number[] = [];
    const rating_labels: string[] = [];
    for (const k of expected) {
      const b = byKey.get(k);
      if (b && b.ratingN > 0) {
        rating_series.push(Math.round((b.ratingSum / b.ratingN) * 100) / 100);
        rating_labels.push(b.label);
      }
    }
    return { earnings_series, rating_series, rating_labels };
  }

  // Calendar month → five buckets: days 1-7, 8-14, 15-21, 22-28, 29-31.
  const BUCKET_LABELS = ["W1", "W2", "W3", "W4", "W5"];
  const buckets = BUCKET_LABELS.map((label) => ({ label, earn: 0, ratingSum: 0, ratingN: 0 }));
  for (const r of rows) {
    if (!r.completed_at) continue;
    const day = parseInt(DHAKA_DAY.format(r.completed_at), 10);
    const idx = Math.min(Math.floor((day - 1) / 7), 4);
    buckets[idx].earn += r.driver_fare_bdt ?? 0;
    if (r.driver_rating !== null) { buckets[idx].ratingSum += r.driver_rating; buckets[idx].ratingN += 1; }
  }
  const earnings_series = buckets.map((b) => ({ label: b.label, value_bdt: b.earn }));
  const rating_series: number[] = [];
  const rating_labels: string[] = [];
  for (const b of buckets) {
    if (b.ratingN > 0) {
      rating_series.push(Math.round((b.ratingSum / b.ratingN) * 100) / 100);
      rating_labels.push(b.label);
    }
  }
  return { earnings_series, rating_series, rating_labels };
}

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const periodParsed = z.enum(["week", "month"]).default("week")
      .safeParse(new URL(request.url).searchParams.get("period") ?? undefined);
    if (!periodParsed.success) {
      return Response.json({ error: "invalid_period", message: "period must be 'week' or 'month'" }, { status: 400 });
    }
    const period = periodParsed.data;

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

    const seriesRows = await db.select({
      completed_at: rides.completed_at,
      driver_fare_bdt: rides.driver_fare_bdt,
      driver_rating: rides.driver_rating,
    })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        eq(rides.status, "completed"),
        gte(rides.completed_at, period === "week" ? weekStart : monthStart),
      ));
    const series = buildSeries(period, seriesRows);

    return Response.json({
      acceptance_rate: parseFloat(String(driver.acceptance_rate ?? "100")) * 1,
      cancellation_rate: Math.round(cancellationRate * 100) / 100,
      rating: parseFloat(String(driver.rating ?? "5.00")),
      trips_this_week: weekTripsRow?.cnt ?? 0,
      trips_this_month: monthTripsRow?.cnt ?? 0,
      online_hours: Math.round(onlineHours * 10) / 10,
      earnings_series: series.earnings_series,
      rating_series: series.rating_series,
      rating_labels: series.rating_labels,
    }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/performance] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
