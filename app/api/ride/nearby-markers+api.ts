import { db } from "@/src/db";
import { drivers } from "@/src/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { getH3Ring } from "@/lib/h3";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";

const MARKER_RING_K = 30;

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM.optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.ok) return parsed.response;

    const { lat, lng, vehicle_type } = parsed.data;

    try {
      await verifySupabaseToken(request);
    } catch {
      // Allow unauthenticated — markers are public info
    }

    const cells = getH3Ring(lat, lng, MARKER_RING_K);

    const whereConditions = [
      eq(drivers.is_online, true),
      eq(drivers.status, "active"),
      inArray(drivers.h3_cell_res9, cells),
      sql`drivers.last_location_lat IS NOT NULL`,
      sql`drivers.last_location_lng IS NOT NULL`,
    ];

    if (vehicle_type) {
      whereConditions.push(eq(drivers.vehicle_type, vehicle_type as any));
    }

    const rows = await db
      .select({
        id: drivers.id,
        lat: drivers.last_location_lat,
        lng: drivers.last_location_lng,
        vehicle_type: drivers.vehicle_type,
      })
      .from(drivers)
      .where(and(...whereConditions))
      .limit(50);

    const markers = rows
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({
        id: r.id,
        lat: Number(r.lat),
        lng: Number(r.lng),
        vehicle_type: r.vehicle_type,
      }));

    return Response.json({ markers });
  } catch (err: unknown) {
    logger.error("[ride/nearby-markers] error", err);
    return Response.json(
      { error: "internal_error", message: "Unexpected error" },
      { status: 500 },
    );
  }
}
