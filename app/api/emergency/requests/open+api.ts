/**
 * GET /api/emergency/requests/open — fleet-surface ambulance entry feed (C8-2).
 *
 * Lists emergency requests still awaiting acceptance: status broadcasting,
 * unexpired, no accepted cert yet. The fleet surface renders an Accept
 * button per row that POSTs the existing
 * /api/emergency/requests/[id]/accept endpoint — this feed performs NO
 * assignment itself, and the accept endpoint keeps its
 * requireAmbulanceCertified gate (verified cert + active driver), so a
 * non-certified staffer sees the queue but cannot take from it.
 *
 * Gate: any ACTIVE fleet_members row (any role — dispatchers watch the
 * queue; acceptance is separately certified). No subscription requirement:
 * ambulance acceptance is a certification capability, not a rental-plan
 * feature. Feature flag: marketplace_ambulance_enabled → 403 when off.
 */
import { db } from "@/src/db";
import { emergencyRequests } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { isVerticalEnabled } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

export async function GET(request: Request) {
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
    if (!dbUser?.id) {
      return Response.json({ error: "user_not_found", message: "No user record" }, { status: 403 });
    }

    // Fleet-surface context: ≥1 active membership (any role).
    const { data: membership } = await supabaseAdmin
      .from("fleet_members")
      .select("id")
      .eq("user_id", dbUser.id)
      .eq("status", "active")
      .is("removed_at", null)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      return Response.json(
        { error: "forbidden", message: "Fleet membership required" },
        { status: 403 },
      );
    }

    const rows = await db
      .select({
        id: emergencyRequests.id,
        pickup_address: emergencyRequests.pickup_address,
        pickup_lat: emergencyRequests.pickup_lat,
        pickup_lng: emergencyRequests.pickup_lng,
        dropoff_address: emergencyRequests.dropoff_address,
        patient_condition: emergencyRequests.patient_condition,
        requires_paramedic: emergencyRequests.requires_paramedic,
        service_level: emergencyRequests.service_level,
        status: emergencyRequests.status,
        expires_at: emergencyRequests.expires_at,
        created_at: emergencyRequests.created_at,
      })
      .from(emergencyRequests)
      .where(
        and(
          eq(emergencyRequests.status, "broadcasting"),
          gt(emergencyRequests.expires_at, sql`now()`),
          isNull(emergencyRequests.accepted_cert_id),
        ),
      )
      .orderBy(desc(emergencyRequests.created_at))
      .limit(20);

    return Response.json({ requests: rows }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    if (status === 403) {
      return Response.json({ error: "forbidden", message: "Not authorized" }, { status: 403 });
    }
    logger.error("[emergency/open] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
