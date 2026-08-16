// Auth: verifySupabaseToken via requireRole
import { db } from "@/src/db";
import { rides, drivers } from "@/src/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

export async function POST(request: Request, { id }: { id: string }) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "invalid_uuid", message: "Invalid UUID format" }, { status: 400 });
  }
  const rideId = parsed.data;

  try {
    const { dbUser: user } = await requireRole("driver")(request);

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver)
      return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1);
    if (!ride)
      return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.driver_id !== driver.id) {
      return Response.json({ error: 'not_your_ride', message: 'This ride does not belong to you' }, { status: 403 });
    }

    // M-1: atomic claim (mirror the WS arrived handler). A rider cancel
    // landing between the read and an unguarded write would resurrect a
    // cancelled ride to driver_arrived — cancellable again, so a second fee
    // and a second compensation credit.
    const now = new Date();
    const [claimed] = await db
      .update(rides)
      .set({ status: "driver_arrived", arrived_at: now, updated_at: now })
      .where(and(eq(rides.id, rideId), inArray(rides.status, ["matched", "driver_arriving"])))
      .returning({ id: rides.id });
    if (!claimed) {
      return Response.json(
        {
          error: "invalid_status",
          message: `Cannot mark arrive in status: ${ride.status}`,
        },
        { status: 409 },
      );
    }

    // Emit WebSocket event to rider
    const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
    const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
    if (internalSecret && ride.user_id) {
      fetch(`http://127.0.0.1:${wsPort}/internal/ride/driver-arrived`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalSecret}`,
        },
        signal: AbortSignal.timeout(3_000),
        body: JSON.stringify({
          ride_id: rideId,
          rider_user_id: ride.user_id,
          arrived_at: now.toISOString(),
        }),
      }).catch((e) =>
        logger.warn("[ride/arrive] WS emit failed", { error: e.message }),
      );
    }

    logger.info("[ride/arrive] driver arrived", {
      rideId,
      driverId: driver.id,
    });
    return Response.json({
      ok: true,
      status: "driver_arrived",
      arrived_at: now.toISOString(),
    });
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: err.status });
    }
    logger.error("[ride/arrive] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
