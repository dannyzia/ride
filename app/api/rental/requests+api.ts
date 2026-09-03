/**
 * Rental requests.
 *
 * POST /api/rental/requests — create a rental request (rider/driver)
 * GET  /api/rental/requests/active — user's active requests
 * GET  /api/rental/requests/history — user's completed/cancelled requests
 *
 * Rate limit: max 1 per 5 min AND ≤3 open requests (F18).
 * Feature flag: marketplace_rental_enabled.
 */
import { db } from "@/src/db";
import { rentalRequests, rentalRequestEvents, rentalVehicleTypeEnum, rateLimits } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled, getConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, desc, count, lt, inArray, sql } from "drizzle-orm";

// Per-category vehicle accept-lists — DERIVED from the DB enum, never inline
// (ruling 16: car_* values exist in the enum; car UI is Phase 2b, another lane).
type RentalVehicleType = (typeof rentalVehicleTypeEnum.enumValues)[number];

const CAR_VEHICLE_TYPES: readonly string[] = rentalVehicleTypeEnum.enumValues.filter(
  (v) => v.startsWith("car_"),
);
const AMBULANCE_VEHICLE_TYPES: readonly string[] = rentalVehicleTypeEnum.enumValues.filter(
  (v) => v.startsWith("ambulance_"),
);
const TRUCK_VEHICLE_TYPES: readonly string[] = rentalVehicleTypeEnum.enumValues.filter(
  (v) => !v.startsWith("car_") && !v.startsWith("ambulance_"),
);

const createSchema = z
  .object({
    category: z.enum(["car_rental", "truck_rental", "ambulance_scheduled"]),
    urgency: z.enum(["standard", "alarm"]).default("standard"),
    pickup_address: z.string().min(1).max(500),
    pickup_lat: z.number().min(-90).max(90),
    pickup_lng: z.number().min(-180).max(180),
    dropoff_address: z.string().min(1).max(500),
    dropoff_lat: z.number().min(-90).max(90),
    dropoff_lng: z.number().min(-180).max(180),
    cargo_tags: z.array(z.string()).optional(),
    cargo_weight_kg: z.number().int().positive().optional(),
    cargo_volume_m3: z.number().positive().optional(),
    cargo_description: z.string().max(1000).optional(),
    rental_options: z.string().max(200).optional(), // ruling 13: comma-separated option/condition chips
    requested_vehicle_type: z.string().optional(),
    scheduled_start_at: z.string().datetime().nullable().optional(), // ruling 14: ISO; NULL = start now
    duration_hours: z.number().int().min(1).max(720).optional(), // ruling 14
    patient_condition: z.string().max(500).optional(),
    requires_paramedic: z.boolean().optional(),
    service_level: z.enum(["BLS", "ALS"]).optional(),
    bidding_window_seconds: z.number().int().min(300).max(3600).default(1200),
    tracking_required: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (!val.requested_vehicle_type) return;
    const allowed =
      val.category === "truck_rental"
        ? TRUCK_VEHICLE_TYPES
        : val.category === "car_rental"
          ? CAR_VEHICLE_TYPES
          : AMBULANCE_VEHICLE_TYPES;
    if (!allowed.includes(val.requested_vehicle_type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requested_vehicle_type"],
        message: `requested_vehicle_type must be one of: ${allowed.join(", ")}`,
      });
    }
  });

export async function POST(request: Request) {
  try {
    // N19: auth precedes the feature flag — an unauthenticated caller gets 401,
    // never a flag-state probe (403 feature_disabled).
    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

    if (!(await isVerticalEnabled("marketplace_rental_enabled"))) {
      return Response.json(
        { error: "feature_disabled", message: "Rental marketplace is not enabled" },
        { status: 403 },
      );
    }

    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    // Ambulance cross-field validation (F2)
    if (body.category === "ambulance_scheduled") {
      if (!body.service_level) {
        return Response.json(
          { error: "service_level_required", message: "service_level required for ambulance_scheduled" },
          { status: 400 },
        );
      }
      if (body.requires_paramedic && body.service_level !== "ALS") {
        return Response.json(
          { error: "paramedic_requires_als", message: "requires_paramedic requires service_level=ALS" },
          { status: 400 },
        );
      }
    }

    // Rate limit: 1 per 5 minutes (F18) — rate_limits table
    const rateLimitKey = `rental_create:${dbUser.id}`;
    const rateLimitWindow = new Date(Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000));
    const [rateLimitRow] = await db
      .insert(rateLimits)
      .values({ key: rateLimitKey, window_start: rateLimitWindow, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.window_start],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });

    if ((rateLimitRow?.count ?? 0) > 1) {
      return Response.json(
        { error: "rate_limited", message: "Maximum 1 request per 5 minutes" },
        { status: 429 },
      );
    }

    // Rate limit: ≤3 open requests (F18)
    const [openCount] = await db
      .select({ cnt: count() })
      .from(rentalRequests)
      .where(
        and(
          eq(rentalRequests.rider_user_id, dbUser.id),
          inArray(rentalRequests.status, ["broadcasting", "collecting", "awarded", "confirmed"]),
        ),
      );

    if ((openCount?.cnt ?? 0) >= 3) {
      return Response.json(
        { error: "too_many_open", message: "Maximum 3 open requests at a time" },
        { status: 429 },
      );
    }

    const now = new Date();
    const biddingWindow = body.bidding_window_seconds ?? 1200;
    const softDeadline = new Date(now.getTime() + biddingWindow * 1000);

    const { request: req } = await db.transaction(async (tx) => {
      const [request] = await tx
        .insert(rentalRequests)
        .values({
          category: body.category,
          urgency: body.urgency,
          rider_user_id: dbUser.id,
          pickup_address: body.pickup_address,
          pickup_lat: String(body.pickup_lat),
          pickup_lng: String(body.pickup_lng),
          dropoff_address: body.dropoff_address,
          dropoff_lat: String(body.dropoff_lat),
          dropoff_lng: String(body.dropoff_lng),
          cargo_tags: body.cargo_tags,
          cargo_weight_kg: body.cargo_weight_kg,
          cargo_volume_m3: body.cargo_volume_m3 ? String(body.cargo_volume_m3) : null,
          cargo_description: body.cargo_description,
          rental_options: body.rental_options ?? null,
          requested_vehicle_type: (body.requested_vehicle_type ?? null) as RentalVehicleType | null,
          scheduled_start_at: body.scheduled_start_at ? new Date(body.scheduled_start_at) : null,
          duration_hours: body.duration_hours ?? null,
          patient_condition: body.patient_condition,
          requires_paramedic: body.requires_paramedic ?? null,
          service_level: body.service_level,
          bidding_window_seconds: body.bidding_window_seconds,
          soft_deadline_at: softDeadline,
          tracking_required: body.tracking_required,
        })
        .returning({ id: rentalRequests.id });

      // Audit event
      await tx.insert(rentalRequestEvents).values({
        request_id: request.id,
        event_type: "request_created",
        payload: { category: body.category, urgency: body.urgency },
        created_by: dbUser.id,
      });

      return { request };
    });

    return Response.json(
      {
        request_id: req.id,
        soft_deadline_at: softDeadline.toISOString(),
        status: "broadcasting",
        message: "Rental request created",
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: (err as Error).message ?? "Not authorized" },
        { status: 403 },
      );
    if (status === 429)
      return Response.json(
        { error: "too_many_open", message: "Maximum 3 open requests at a time" },
        { status: 429 },
      );
    logger.error("[rental/requests POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith("/active")) {
      const rows = await db
        .select()
        .from(rentalRequests)
        .where(
          and(
            eq(rentalRequests.rider_user_id, dbUser.id),
            lt(rentalRequests.status, "cancelled"), // broadcasting|collecting|awarded|confirmed
          ),
        )
        .orderBy(desc(rentalRequests.created_at))
        .limit(20);

      return Response.json({ requests: rows });
    }

    // History
    const rows = await db
      .select()
      .from(rentalRequests)
      .where(eq(rentalRequests.rider_user_id, dbUser.id))
      .orderBy(desc(rentalRequests.created_at))
      .limit(50);

    return Response.json({ requests: rows });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    logger.error("[rental/requests GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
