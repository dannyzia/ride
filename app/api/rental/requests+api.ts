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
import { rentalRequests, rentalRequestEvents } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled, getConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, desc, count, lt } from "drizzle-orm";

const createSchema = z.object({
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
  requested_vehicle_type: z.string().optional(),
  patient_condition: z.string().max(500).optional(),
  requires_paramedic: z.boolean().optional(),
  service_level: z.enum(["BLS", "ALS"]).optional(),
  bidding_window_seconds: z.number().int().min(300).max(3600).default(1200),
  tracking_required: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    if (!(await isVerticalEnabled("marketplace_rental_enabled"))) {
      return Response.json(
        { error: "feature_disabled", message: "Rental marketplace is not enabled" },
        { status: 403 },
      );
    }

    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

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

    // Rate limit: ≤3 open requests (F18)
    const [openCount] = await db
      .select({ cnt: count() })
      .from(rentalRequests)
      .where(
        and(
          eq(rentalRequests.rider_user_id, dbUser.id),
          lt(rentalRequests.created_at, new Date(Date.now() - 24 * 60 * 60 * 1000)),
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
          requested_vehicle_type: body.requested_vehicle_type as "pickup" | "mini_truck" | "medium_truck" | "heavy_truck" | "trailer" | "van" | "ambulance_basic" | "ambulance_advanced" | null,
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
