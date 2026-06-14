// GET /api/admin/driver-economics
// F15-API-04. Per-driver economics summary: cost per ride, negative earners.
import { db } from "@/src/db";
import { drivers, users, subscriptions, packages } from "@/src/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    await requireRole("admin")(request);

    // Only include active or temporarily active drivers
    const rows = await db
      .select({
        driver_id: drivers.id,
        vehicle_type: drivers.vehicle_type,
        status: drivers.status,
        completed_rides_count: drivers.completed_rides_count,
        user_name: users.name,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(inArray(drivers.status, ["active", "temporary"]));

    // Latest active subscription per driver
    const driverIds = rows.map((r) => r.driver_id);
    const subRows = driverIds.length
      ? await db
          .select({
            driver_id: subscriptions.driver_id,
            package_id: subscriptions.package_id,
            calls_remaining: subscriptions.calls_remaining,
            status: subscriptions.status,
            purchased_at: subscriptions.purchased_at,
            expires_at: subscriptions.expires_at,
            package_price_bdt: packages.price_bdt,
            package_call_count: packages.call_count,
          })
          .from(subscriptions)
          .innerJoin(packages, eq(subscriptions.package_id, packages.id))
          .where(inArray(subscriptions.driver_id, driverIds))
          .orderBy(desc(subscriptions.purchased_at))
      : [];

    // Take only the latest active subscription per driver
    const latestByDriver = new Map<string, (typeof subRows)[number]>();
    for (const s of subRows) {
      if (!latestByDriver.has(s.driver_id)) {
        latestByDriver.set(s.driver_id, s);
      }
    }

    const result = rows.map((r) => {
      const sub = latestByDriver.get(r.driver_id);
      const subscriptionCostBdt = sub?.package_price_bdt ?? null;
      const subscriptionExpiresAt = sub?.expires_at ?? null;
      const callsRemaining = sub?.calls_remaining ?? null;
      const packageCallCount = sub?.package_call_count ?? null;

      const completed = r.completed_rides_count ?? 0;
      // Best-effort cost/ride estimate: package cost / package call_count.
      const costPerRideBdt =
        subscriptionCostBdt !== null && packageCallCount && packageCallCount > 0
          ? Math.round(subscriptionCostBdt / packageCallCount)
          : null;

      const is_negative_earner =
        subscriptionCostBdt !== null &&
        subscriptionCostBdt > 0 &&
        completed === 0;

      return {
        driver_id: r.driver_id,
        driver_name: r.user_name,
        vehicle_type: r.vehicle_type,
        status: r.status,
        subscription_cost_bdt: subscriptionCostBdt,
        completed_rides_count: completed,
        cost_per_ride_bdt: costPerRideBdt,
        calls_remaining: callsRemaining,
        subscription_expires_at: subscriptionExpiresAt,
        is_negative_earner: is_negative_earner,
      };
    });

    return Response.json({ drivers: result, total: result.length });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/driver-economics] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
