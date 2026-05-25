import { z } from 'zod';
import { db } from '../../../../src/db';
import { chatMessages, rides, users } from '../../../../src/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '../../../../lib/auth';
import { logger } from '../../../../lib/logger';

const schema = z.object({
  content: z.string().min(1).max(1000),
});

const CHAT_ENABLED_STATUSES = ['matched', 'driver_arriving', 'in_progress'] as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const decoded = await verifyFirebaseIdToken(req);

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'invalid_body' }, { status: 400 });

    const { content } = parsed.data;

    const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.auth_uid, decoded.uid)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, params.id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });

    if (ride.user_id !== user.id && ride.driver_id !== user.id) {
      return Response.json({ error: 'not_ride_participant' }, { status: 403 });
    }

    if (!(CHAT_ENABLED_STATUSES as readonly string[]).includes(ride.status)) {
      return Response.json({ error: 'chat_closed' }, { status: 403 });
    }

    const [msg] = await db.insert(chatMessages).values({
      ride_id: params.id,
      sender_id: user.id,
      content,
    }).returning();

    // Relay to the other participant via utils-server internal endpoint
    const wsPort = process.env.UTILS_SERVER_PORT ?? '3001';
    const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
    if (internalSecret) {
      const otherUserId = ride.user_id === user.id ? ride.driver_id : ride.user_id;
      fetch(`http://127.0.0.1:${wsPort}/internal/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalSecret}` },
        signal: AbortSignal.timeout(5_000),
        body: JSON.stringify({
          ride_id: params.id,
          recipient_user_id: otherUserId,
          message: {
            id: msg.id,
            ride_id: msg.ride_id,
            sender_id: msg.sender_id,
            sender_role: user.role,
            content: msg.content,
            created_at: msg.created_at,
          },
        }),
      }).catch(err => logger.error('[ride/message] chat relay failed', err));
    }

    return Response.json({
      id: msg.id,
      ride_id: msg.ride_id,
      sender_id: msg.sender_id,
      sender_role: user.role,
      content: msg.content,
      created_at: msg.created_at,
    }, { status: 201 });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[ride/message] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
