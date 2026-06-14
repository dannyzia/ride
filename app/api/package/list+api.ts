import { db } from "@/src/db";
import { packages, drivers, users } from "@/src/db/schema";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

// GET /api/package/list
// Returns active packages visible to the calling driver.
// A package is visible if:
//   - vehicle_type IS NULL (universal — available to all vehicle types), OR
//   - vehicle_type matches the driver's vehicle_type.
// If the caller has no driver record yet, only universal packages are shown.
export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    // Look up the driver's vehicle type.
    const [driver] = await db
      .select({ vehicle_type: drivers.vehicle_type })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);

    const driverVehicleType = driver?.vehicle_type ?? null;

    const whereClause = driverVehicleType
      ? and(
          eq(packages.is_active, true),
          or(
            isNull(packages.vehicle_type),
            eq(packages.vehicle_type, driverVehicleType),
          ),
        )
      : and(eq(packages.is_active, true), isNull(packages.vehicle_type));

    const pkgList = await db
      .select({
        id: packages.id,
        name: packages.name,
        call_count: packages.call_count,
        duration_days: packages.duration_days,
        price_bdt: packages.price_bdt,
        daily_cap: packages.daily_cap,
        is_trial: packages.is_trial,
        vehicle_type: packages.vehicle_type,
      })
      .from(packages)
      .where(whereClause)
      .orderBy(asc(packages.price_bdt));

    return Response.json({ packages: pkgList });
  } catch (e: any) {
    if (e.status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Invalid or missing token" },
        { status: 401 },
      );
    }
    logger.error("[package/list] error", e);
    return Response.json(
      { error: "internal_error", message: "Failed to fetch packages" },
      { status: 500 },
    );
  }
}
