import { db } from "@/src/db";
import { drivers } from "@/src/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { getH3Ring } from "@/lib/h3";
import { haversineDistance } from "@/utils/mapUtils";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";

// K deliberately mirrors DISPATCH_H3_RING_K so the rider-facing count matches
// what the dispatch pool can actually find (doc 02 rejected a smaller K on
// parity grounds). Cost accepted knowingly: at K=60 the ring is ~11k cells
// shipped as an inArray against drivers.h3_cell_res9 — index-backed by
// drivers_h3_cell_idx (live since migration 0000), so each 5s poll is a
// bounded index scan, not a seq scan. Revisit only if per-poll latency or DB
// load shows up in monitoring.
const NEARBY_RING_K = parseInt(process.env.DISPATCH_H3_RING_K ?? "60", 10);

const bodySchema = z.object({
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
});

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.ok) return parsed.response;

    const { pickup_lat, pickup_lng, vehicle_type } = parsed.data;

    let _supabaseUser;
    try {
      _supabaseUser = await verifySupabaseToken(request);
    } catch (e: unknown) {
      const status = e instanceof Error ? (e as { status?: number }).status : undefined;
      return Response.json(
        { error: "unauthorized", message: "Invalid token" },
        { status: status ?? 401 }
      );
    }

    try {
      const cells = getH3Ring(pickup_lat, pickup_lng, NEARBY_RING_K);
      const rows = await db
        .select({ id: drivers.id, lat: drivers.last_location_lat, lng: drivers.last_location_lng })
        .from(drivers)
        .where(
          and(
            eq(drivers.is_online, true),
            eq(drivers.status, "active"),
            eq(drivers.vehicle_type, vehicle_type as any),
            inArray(drivers.h3_cell_res9, cells),
            // Busy filter — must mirror utils-server/dispatch.ts exactly
            // (including 'driver_arriving': en route to pickup is busy). See
            // the comment there for why the status is in the list even though
            // nothing sets it yet.
            sql`NOT EXISTS (SELECT 1 FROM rides WHERE rides.driver_id = drivers.id AND rides.status IN ('matched','driver_arriving','driver_arrived','in_progress') AND rides.updated_at > now() - interval '3 hours')`
          )
        );

      const count = rows.length;
      let estimated_wait_minutes: number | null = null;

      const dists = rows
        .map((r) =>
          r.lat != null && r.lng != null
            ? haversineDistance(pickup_lat, pickup_lng, Number(r.lat), Number(r.lng))
            : Infinity
        )
        .filter((d) => Number.isFinite(d));

      if (dists.length > 0) {
        const nearestKm = Math.min(...dists);
        estimated_wait_minutes = Math.max(2, Math.round((nearestKm / 15) * 60));
      }

      return Response.json({ count, estimated_wait_minutes });
    } catch {
      return Response.json(
        { error: "nearby_failed", message: "Could not query nearby drivers" },
        { status: 500 }
      );
    }
    } catch (err: unknown) {
      logger.error("[ride/nearby-drivers] error", err);
      return Response.json({ error: "internal_error", message: "Unexpected error" }, { status: 500 });
    }
}
