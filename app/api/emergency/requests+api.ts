/**
 * POST /api/emergency/requests — create an emergency ambulance request
 * (§C.6; v1 §C.6.3). No bidding: the chain broadcasts to eligible certified
 * drivers (job 56) and first-accept-wins (§B.0).
 * Feature flag: marketplace_ambulance_enabled.
 */
import { db } from "@/src/db";
import { emergencyRequests } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled, getConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";

const createSchema = z.object({
  pickup_address: z.string().min(1).max(500),
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().max(500).optional(),
  dropoff_lat: z.number().min(-90).max(90).optional(),
  dropoff_lng: z.number().min(-180).max(180).optional(),
  patient_condition: z.string().min(1).max(500),
  requires_paramedic: z.boolean().default(false),
  service_level: z.enum(["BLS", "ALS"]),
});

export async function POST(request: Request) {
  try {
    if (!(await isVerticalEnabled("marketplace_ambulance_enabled"))) {
      return Response.json(
        { error: "feature_disabled", message: "Ambulance service is not enabled" },
        { status: 403 },
      );
    }

    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("auth_uid", supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json(
        { error: "user_not_found", message: "No user record" },
        { status: 403 },
      );
    }

    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const ttlSeconds = await getConfigInt("emergency_ttl_seconds", 120);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const [req] = await db
      .insert(emergencyRequests)
      .values({
        caller_user_id: dbUser.id,
        pickup_address: body.pickup_address,
        pickup_lat: String(body.pickup_lat),
        pickup_lng: String(body.pickup_lng),
        dropoff_address: body.dropoff_address ?? null,
        dropoff_lat: body.dropoff_lat != null ? String(body.dropoff_lat) : null,
        dropoff_lng: body.dropoff_lng != null ? String(body.dropoff_lng) : null,
        patient_condition: body.patient_condition,
        requires_paramedic: body.requires_paramedic,
        service_level: body.service_level,
        status: "broadcasting",
        expires_at: expiresAt,
      })
      .returning();

    return Response.json(
      { request: req, message: "Emergency broadcast" },
      { status: 201 },
    );
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    logger.error("[emergency/requests POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
