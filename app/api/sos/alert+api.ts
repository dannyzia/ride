import { db } from "../../../src/db";
import { users, rides, sosAlerts } from "../../../src/db/schema";
import { eq, and } from "drizzle-orm";
import { verifySupabaseToken } from "../../../lib/auth";
import { logger } from "../../../lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import * as errors from "@/lib/errors";

// T-1: this endpoint serves BOTH riders and drivers (the plan's canonical
// POST /api/sos/alert — the previous driver/sos-alert route 403'd riders, so
// the rider SOS button could never reach the sos_alerts machinery).
const sosSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // Optional ride context so the admin SOS dashboard can tie the alert to a
  // ride (and the auto-SOS can dedupe to one open alert per ride).
  ride_id: z.string().uuid().optional(),
  message: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }
    if (dbUser.role !== "rider" && dbUser.role !== "driver") {
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    }

    const parsed = await parseJsonBody(request, sosSchema);
    if (!parsed.ok) return parsed.response;

    const { lat, lng, ride_id, message } = parsed.data;

    // C-4: ride ownership — an SOS may only be attached to a ride the caller
    // is actually part of (as rider or as driver). Without this, any user
    // could attach alerts to arbitrary ride ids, and the per-ride dedupe
    // below would let them suppress someone else's open alert.
    if (ride_id) {
      const [ride] = await db
        .select({ user_id: rides.user_id, driver_id: rides.driver_id })
        .from(rides)
        .where(eq(rides.id, ride_id))
        .limit(1);
      if (!ride) {
        return Response.json({ error: "ride_not_found", message: "Ride not found" }, { status: 404 });
      }
      const isRider = ride.user_id === dbUser.id;
      const isDriver = ride.driver_id === dbUser.id;
      if (!isRider && !isDriver) {
        return Response.json({ error: "not_your_ride", message: "You can only send an SOS for your own ride" }, { status: 403 });
      }
    }

    // One open alert per ride: if the ride already has an open SOS (e.g. the
    // auto-SOS fired, or the user double-tapped), keep the existing row — the
    // alert is already on the admin dashboard.
    if (ride_id) {
      const [existing] = await db
        .select({ id: sosAlerts.id })
        .from(sosAlerts)
        .where(and(eq(sosAlerts.ride_id, ride_id), eq(sosAlerts.status, "open")))
        .limit(1);
      if (existing) {
        logger.info("[sos/alert] open alert already exists for ride, keeping it", { ride_id, alertId: existing.id });
        return Response.json({ ok: true, deduped: true });
      }
    }

    await db.insert(sosAlerts).values({
      user_id: dbUser.id,
      role: dbUser.role as "rider" | "driver",
      latitude: lat.toString(),
      longitude: lng.toString(),
      ride_id: ride_id ?? null,
      message: message ?? (dbUser.role === "driver" ? "Driver SOS alert" : "Rider SOS alert"),
      contacts_notified: [],
    });

    logger.info("[sos/alert] recorded", { user_id: dbUser.id, role: dbUser.role, lat, lng, ride_id });

    return Response.json({ ok: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    logger.error("[sos/alert] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
