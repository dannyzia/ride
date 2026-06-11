// Auth: verifySupabaseToken via requireRole
import { db } from "@/src/db";
import { rides, pricing, drivers } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { calculateFare } from "@/lib/fareCalc";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split("/");
    const rideId = segments[segments.indexOf("ride") + 1];
    if (!rideId)
      return Response.json({ error: "missing_ride_id" }, { status: 400 });

    const { dbUser: user } = await requireRole("driver")(request);

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver)
      return Response.json({ error: "driver_not_found" }, { status: 404 });

    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1);
    if (!ride)
      return Response.json({ error: "ride_not_found" }, { status: 404 });
    if (ride.driver_id !== driver.id) {
      return Response.json({ error: "not_your_ride" }, { status: 403 });
    }
    if (ride.status !== "in_progress") {
      return Response.json(
        {
          error: "invalid_status",
          message: `Cannot complete ride in status: ${ride.status}`,
        },
        { status: 409 },
      );
    }

    // Get pricing for fare calculation
    const [pricingRow] = await db
      .select()
      .from(pricing)
      .where(eq(pricing.id, ride.pricing_id))
      .limit(1);
    if (!pricingRow) {
      return Response.json({ error: "pricing_not_found" }, { status: 500 });
    }

    // Compute ride time using the timer rule:
    //   timer_start = min(arrived_at + max_free_wait_seconds, started_at)
    //   If arrived_at IS NULL, timer_start = started_at
    //   ride_time_min = CEIL((completed_at - timer_start) / 60000)
    const MAX_FREE_WAIT_MS = 60_000; // system_config.max_free_wait_seconds (default 60)
    const completedAt = new Date();
    const startedAt = ride.started_at ? new Date(ride.started_at) : completedAt;
    const arrivedAt = ride.arrived_at ? new Date(ride.arrived_at) : null;

    let timerStart: Date;
    if (arrivedAt) {
      const freeWaitExpiry = new Date(arrivedAt.getTime() + MAX_FREE_WAIT_MS);
      timerStart = new Date(
        Math.min(freeWaitExpiry.getTime(), startedAt.getTime()),
      );
    } else {
      timerStart = startedAt;
    }

    const rideTimeMin = Math.max(
      0,
      Math.ceil((completedAt.getTime() - timerStart.getTime()) / 60_000),
    );
    const distanceKm = parseFloat(ride.distance_km?.toString() ?? "0");

    // Recalculate fare with actual ride time
    const fare = calculateFare(
      {
        base_fare_bdt: pricingRow.base_fare_bdt,
        per_km_bdt: pricingRow.per_km_bdt,
        per_min_bdt: pricingRow.per_min_bdt,
        floor_length_km: Number(pricingRow.floor_length_km ?? 0),
        floor_min: pricingRow.floor_min ?? 0,
        brta_fare_ceiling_bdt: pricingRow.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(
          pricingRow.platform_commission_percent ?? 0,
        ),
      },
      distanceKm,
      rideTimeMin,
    );

    await db
      .update(rides)
      .set({
        status: "completed",
        completed_at: completedAt,
        platform_commission_bdt: fare.platform_commission_bdt,
        fare_breakdown: fare as any,
        updated_at: completedAt,
      })
      .where(eq(rides.id, rideId));

    logger.info("[ride/complete] ride completed", {
      rideId,
      driverId: driver.id,
      totalBdt: fare.total_bdt,
      driverNetBdt: fare.driver_net_bdt,
      rideTimeMin,
    });

    // Emit WebSocket event to rider
    const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
    const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
    if (internalSecret && ride.user_id) {
      fetch(`http://127.0.0.1:${wsPort}/internal/ride/completed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalSecret}`,
        },
        signal: AbortSignal.timeout(3_000),
        body: JSON.stringify({
          ride_id: rideId,
          rider_user_id: ride.user_id,
          total_bdt: fare.total_bdt,
          driver_net_bdt: fare.driver_net_bdt,
          ride_time_min: rideTimeMin,
          fare_breakdown: fare,
        }),
      }).catch((e) =>
        logger.warn("[ride/complete] WS emit failed", { error: e.message }),
      );
    }

    return Response.json({
      ok: true,
      status: "completed",
      completed_at: completedAt.toISOString(),
      fare_breakdown: fare,
    });
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: "unauthorized" }, { status: err.status });
    }
    logger.error("[ride/complete] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
