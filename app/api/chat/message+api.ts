import { z } from "zod";
import { db } from "../../../src/db";
import { chatMessages, rides, users } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "../../../lib/auth";

const sendSchema = z.object({
  ride_id: z.string().uuid(),
  content: z.string().min(1).max(1000),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const body = await sendSchema.parseAsync(await request.json());

    // Resolve auth uid to DB user id
    const [sender] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, user.id))
      .limit(1);
    if (!sender)
      return Response.json({ error: "user_not_found" }, { status: 404 });

    // Verify sender is participant in this ride
    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, body.ride_id))
      .limit(1);
    if (!ride)
      return Response.json({ error: "ride_not_found" }, { status: 404 });
    if (ride.user_id !== sender.id && ride.driver_id !== sender.id) {
      return Response.json({ error: "not_ride_participant" }, { status: 403 });
    }

    const [msg] = await db
      .insert(chatMessages)
      .values({
        ride_id: body.ride_id,
        sender_id: sender.id,
        content: body.content,
      })
      .returning();

    // Push real-time notification to recipient via WebSocket
    const recipientUserId =
      ride.user_id === sender.id ? ride.driver_id : ride.user_id;
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
  } catch (e: any) {
    if (e.name === "ZodError")
      return Response.json({ error: e.issues }, { status: 400 });
    return Response.json(
      { error: e.message ?? "chat_failed" },
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
      return Response.json({ error: "ride_id_required" }, { status: 400 });

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.ride_id, rideId))
      .orderBy(chatMessages.created_at)
      .limit(100);

    return Response.json({ messages });
  } catch (_e: any) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
