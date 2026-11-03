import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { rides, users, rideRoutes } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { resolveRideParticipantIds, isParticipant } from "@/lib/rideParticipants";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json({ error: "invalid_uuid", message: "Invalid ride ID" }, { status: 400 });
    }
    const rideId = id;
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) {
      return Response.json({ error: "ride_not_found", message: "Ride not found" }, { status: 404 });
    }

    const participantIds = await resolveRideParticipantIds(db, ride);
    if (!isParticipant(participantIds, user.id) && user.role !== "admin") {
      return Response.json(
        { error: "not_ride_participant", message: "You are not a participant in this ride" },
        { status: 403 },
      );
    }

    const [routeRecord] = await db
      .select({
        points: rideRoutes.points,
        duration_seconds: rideRoutes.duration_seconds,
        distance_meters: rideRoutes.distance_meters,
      })
      .from(rideRoutes)
      .where(eq(rideRoutes.ride_id, rideId))
      .limit(1);

    return Response.json({
      ride_id: rideId,
      points: routeRecord?.points ?? [],
      duration_seconds: routeRecord?.duration_seconds ?? 0,
      distance_meters: routeRecord?.distance_meters ? Number(routeRecord.distance_meters) : null,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    if (errors.getErrorStatus(err) === 403) {
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    }
    logger.error("[ride/breadcrumbs] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
