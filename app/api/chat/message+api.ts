import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { db } from "../../../src/db";
import { chatMessages, rides, users, drivers } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "../../../lib/auth";
import * as errors from "@/lib/errors";

const sendSchema = z.object({
  ride_id: z.string().uuid(),
  content: z.string().min(1).max(1000),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const bodyResult = await parseJsonBody(request, sendSchema);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;

    // Resolve auth uid to DB user id
    const [sender] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, user.id))
      .limit(1);
    if (!sender)
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    // Verify sender is participant in this ride
    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, body.ride_id))
      .limit(1);
    if (!ride)
      return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    // The ride stores the driver's drivers.id; resolve it to their users.id so
    // both participants are compared in the same ID space. (Mirrors the WS
    // chat:typing guard in utils-server/index.ts — without this, a driver can
    // never send chat: driver_id (drivers.id) never equals sender.id (users.id).)
    const [driverUser] = ride.driver_id
      ? await db
          .select({ user_id: drivers.user_id })
          .from(drivers)
          .where(eq(drivers.id, ride.driver_id))
          .limit(1)
      : [];
    const participants = new Set<string>([ride.user_id]);
    if (driverUser?.user_id) participants.add(driverUser.user_id);
    if (!participants.has(sender.id)) {
      return Response.json({ error: 'not_ride_participant', message: 'You are not a participant in this ride' }, { status: 403 });
    }

    const [msg] = await db
      .insert(chatMessages)
      .values({
        ride_id: body.ride_id,
        sender_id: sender.id,
        content: body.content,
      })
      .returning();

    // Push real-time notification to recipient via WebSocket. The recipient is
    // the OTHER party, identified by users.id — never ride.driver_id, which is
    // a drivers.id that matches no connected user (delivery would vanish).
    const recipientUserId =
      ride.user_id === sender.id ? (driverUser?.user_id ?? null) : ride.user_id;
    if (recipientUserId) {
      const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (internalSecret) {
        try {
          await fetch(`http://127.0.0.1:${wsPort}/internal/chat/send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${internalSecret}`,
            },
            body: JSON.stringify({
              ride_id: body.ride_id,
              recipient_user_id: recipientUserId,
              message: msg,
            }),
            signal: AbortSignal.timeout(3_000),
          });
        } catch {
          // WS push failure is non-fatal — message is already persisted
        }
      }
    }

    return Response.json({ message: msg }, { status: 201 });
  } catch (e: unknown) {
    if (errors.getErrorName(e) === "ZodError")
      return Response.json({ error: errors.getErrorIssues(e) }, { status: 400 });
    return Response.json(
      { error: errors.getErrorMessage(e, "chat_failed") },
      { status: 401 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const _user = await verifySupabaseToken(request);
    const url = new URL(request.url);
    const rideId = url.searchParams.get("ride_id");
    if (!rideId)
      return Response.json({ error: 'ride_id_required', message: 'Ride ID is required' }, { status: 400 });

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.ride_id, rideId))
      .orderBy(chatMessages.created_at)
      .limit(100);

    return Response.json({ messages });
  } catch (_e: unknown) {
    return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
  }
}
