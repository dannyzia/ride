import { db } from "@/src/db";
import { rides, users, drivers } from "@/src/db/schema";
import { eq, and, gte, lt, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const PAGE_SIZE = 20;

const querySchema = z.object({
  status: z
    .enum([
      "all",
      "completed",
      "cancelled",
      "in_progress",
      "matched",
      "expired",
    ])
    .default("all"),
  page: z.coerce.number().int().min(1).default(1),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});



export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user)
      return Response.json(
        { error: "user_not_found", message: "User not found" },
        { status: 404 },
      );

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver)
      return Response.json(
        { error: "driver_not_found", message: "Driver not found" },
        { status: 404 },
      );

    // Parse and validate query params
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return Response.json(
        {
          error: "validation_error",
          message: parsed.error.flatten().formErrors.join("; ") || "Invalid query",
        },
        { status: 400 },
      );
    }
    const { status, page, from_date, to_date } = parsed.data;

    // Build conditions — always scoped to this driver only
    const conditions = [eq(rides.driver_id, driver.id)];

    if (status !== "all") {
      conditions.push(eq(rides.status, status));
    }

    if (from_date) {
      const start = new Date(from_date + "T00:00:00Z");
      conditions.push(gte(rides.created_at, start));
    }
    if (to_date) {
      // End of the day
      const end = new Date(
        new Date(to_date + "T00:00:00Z").getTime() + 24 * 60 * 60 * 1000,
      );
      conditions.push(lt(rides.created_at, end));
    }

    const offset = (page - 1) * PAGE_SIZE;

    // Count total rows for pagination
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(rides)
      .where(and(...conditions));

    const total = Number(countRow?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Fetch page
    const rows = await db
      .select({
        id: rides.id,
        origin_address: rides.origin_address,
        destination_address: rides.destination_address,
        origin_latitude: rides.origin_latitude,
        origin_longitude: rides.origin_longitude,
        destination_latitude: rides.destination_latitude,
        destination_longitude: rides.destination_longitude,
        vehicle_type: rides.vehicle_type,
        status: rides.status,
        distance_km: rides.distance_km,
        driver_fare_bdt: rides.driver_fare_bdt,
        rider_payable_bdt: rides.rider_payable_bdt,
        tip_bdt: rides.tip_bdt,
        platform_commission_bdt: rides.platform_commission_bdt,
        completed_at: rides.completed_at,
        cancel_reason: rides.cancel_reason,
        cancelled_by: rides.cancelled_by,
        created_at: rides.created_at,
        rider_name: users.name,
        rider_rating: rides.rider_rating,
        driver_rating: rides.driver_rating,
      })
      .from(rides)
      .leftJoin(users, eq(rides.user_id, users.id))
      .where(and(...conditions))
      .orderBy(desc(rides.created_at))
      .limit(PAGE_SIZE)
      .offset(offset);

    const trips = rows.map((r) => ({
      id: r.id,
      origin: {
        address: r.origin_address,
        latitude: r.origin_latitude,
        longitude: r.origin_longitude,
      },
      destination: {
        address: r.destination_address,
        latitude: r.destination_latitude,
        longitude: r.destination_longitude,
      },
      vehicle_type: r.vehicle_type,
      status: r.status,
      distance_km: Number(r.distance_km),
      fare_bdt: r.driver_fare_bdt ?? 0,
      rider_payable_bdt: r.rider_payable_bdt ?? 0,
      tip_bdt: r.tip_bdt ?? 0,
      commission_bdt: r.platform_commission_bdt ?? 0,
      completed_at: r.completed_at?.toISOString() ?? null,
      cancel_reason: r.cancel_reason,
      cancelled_by: r.cancelled_by,
      created_at: r.created_at.toISOString(),
      rider: {
        name: r.rider_name,
        rating: r.rider_rating != null ? Number(r.rider_rating) : null,
      },
      driver_rating: r.driver_rating != null ? Number(r.driver_rating) : null,
    }));

    return Response.json(
      {
        trips,
        pagination: {
          page,
          page_size: PAGE_SIZE,
          total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    logger.error("[driver/trips] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
