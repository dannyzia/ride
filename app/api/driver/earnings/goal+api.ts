/**
 * R2.1: Driver Earnings Goal API
 *
 * GET  — returns the driver's active goal + current_bdt (computed from rides table).
 * POST — upserts a new goal (deactivates old active goal, inserts new in one tx).
 *
 * Money is integer paisa throughout. Target bounds: 100–10_000_000 paisa.
 * Progress (current_bdt) is computed at read time from completed rides — no denormalization.
 */
import { db } from "@/src/db";
import { users, drivers, driverEarningsGoals, rides } from "@/src/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { prevBdtMidnightUtc, nextBdtMidnightUtc, bdtMonthStartUtc } from "@/lib/time";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";

export const goalSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]),
  target_bdt: z.number().int().min(100).max(10_000_000),
});

/** Compute the window [start, end) for a given period + driver. */
function periodWindow(period: string): { start: Date; end: Date } {
  switch (period) {
    case "daily":
      return { start: prevBdtMidnightUtc(), end: nextBdtMidnightUtc() };
    case "weekly": {
      // Week starts Sunday in Bangladesh
      const dayStart = prevBdtMidnightUtc();
      const dayOfWeek = new Date(dayStart.getTime() + 6 * 60 * 60 * 1000).getUTCDay();
      const weekStart = new Date(dayStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      return { start: weekStart, end: weekEnd };
    }
    case "monthly": {
      const monthStart = bdtMonthStartUtc();
      const nextMonth = new Date(monthStart);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return { start: monthStart, end: nextMonth };
    }
    default:
      return { start: prevBdtMidnightUtc(), end: nextBdtMidnightUtc() };
  }
}

/** Compute current earnings for a driver over a time window (integer paisa). */
async function computeCurrentEarnings(driverId: string, start: Date, end: Date): Promise<number> {
  const [agg] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${rides.driver_fare_bdt}), 0) + COALESCE(SUM(${rides.tip_bdt}), 0)`,
    })
    .from(rides)
    .where(
      and(
        eq(rides.driver_id, driverId),
        eq(rides.status, "completed"),
        gte(rides.completed_at, start),
        lt(rides.completed_at, end),
      ),
    );
  return Number(agg?.total ?? 0);
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found", message: "Driver not found" }, { status: 404 });

    const [goal] = await db
      .select()
      .from(driverEarningsGoals)
      .where(and(eq(driverEarningsGoals.driver_user_id, driver.id), eq(driverEarningsGoals.is_active, true)))
      .limit(1);

    if (!goal) {
      return Response.json({ goal: null, current_bdt: 0 });
    }

    const { start, end } = periodWindow(goal.period);
    const currentBdt = await computeCurrentEarnings(driver.id, start, end);

    return Response.json({
      goal: {
        id: goal.id,
        period: goal.period,
        target_bdt: goal.target_bdt,
        created_at: goal.created_at,
      },
      current_bdt: currentBdt,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    logger.error("[driver/earnings/goal] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found", message: "Driver not found" }, { status: 404 });

    const parsed = await parseJsonBody(request, goalSchema);
    if (!parsed.ok) return parsed.response;

    const { period, target_bdt } = parsed.data;

    // Deactivate old active goal and insert new in one tx
    const newGoal = await db.transaction(async (tx) => {
      await tx
        .update(driverEarningsGoals)
        .set({ is_active: false, updated_at: new Date() })
        .where(
          and(
            eq(driverEarningsGoals.driver_user_id, driver.id),
            eq(driverEarningsGoals.is_active, true),
          ),
        );

      const [inserted] = await tx
        .insert(driverEarningsGoals)
        .values({
          driver_user_id: driver.id,
          period,
          target_bdt,
          is_active: true,
        })
        .returning();

      return inserted;
    });

    if (!newGoal) {
      return Response.json({ error: "goal_insert_failed", message: "Failed to create earnings goal" }, { status: 500 });
    }

    const { start, end } = periodWindow(period);
    const currentBdt = await computeCurrentEarnings(driver.id, start, end);

    logger.info("[driver/earnings/goal] created", { driverId: driver.id, period, target_bdt });

    return Response.json({
      goal: {
        id: newGoal.id,
        period: newGoal.period,
        target_bdt: newGoal.target_bdt,
        created_at: newGoal.created_at,
      },
      current_bdt: currentBdt,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    logger.error("[driver/earnings/goal] POST error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
