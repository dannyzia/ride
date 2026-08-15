// GET /api/admin/ride/[id]/chat
// F15-API-04. Full chat history for a ride (admin dispute resolution view).
// Joins chat_messages with users so admin sees sender_name + sender_role without
// additional client lookups. Also returns rider/driver context for display.
import { db } from "@/src/db";
import { chatMessages, users, rides, drivers } from "@/src/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";

const idSchema = z.string().uuid();

export async function GET(request: Request, { id }: { id: string }) {
  try {
    await requireRole("admin")(request);
    const rideId = id;

    const parsedId = idSchema.safeParse(rideId);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "id must be a valid UUID" },
        { status: 400 },
      );
    }
    const validatedRideId = parsedId.data;

    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, validatedRideId))
      .limit(1);
    if (!ride)
      return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    const [rider] = ride.user_id
      ? await db
          .select({ id: users.id, name: users.name, phone: users.phone })
          .from(users)
          .where(eq(users.id, ride.user_id))
          .limit(1)
      : [null];

    let driverUser: {
      id: string;
      name: string | null;
      phone: string | null;
    } | null = null;
    if (ride.driver_id) {
      const [result] = await db
        .select({ id: users.id, name: users.name, phone: users.phone })
        .from(users)
        .innerJoin(drivers, eq(drivers.user_id, users.id))
        .where(eq(drivers.id, ride.driver_id))
        .limit(1);
      driverUser = result ?? null;
    }

    const messages = await db
      .select({
        id: chatMessages.id,
        sender_id: chatMessages.sender_id,
        sender_name: users.name,
        sender_role: users.role,
        content: chatMessages.content,
        created_at: chatMessages.created_at,
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.sender_id, users.id))
      .where(eq(chatMessages.ride_id, validatedRideId))
      .orderBy(asc(chatMessages.created_at));

    return Response.json({
      ride_id: validatedRideId,
      ride_status: ride.status,
      ride_created_at: ride.created_at,
      rider: rider ? { name: rider.name, phone: rider.phone } : null,
      driver: driverUser,
      messages,
      message_count: messages.length,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/ride/chat] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
