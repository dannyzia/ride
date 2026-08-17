import { z } from 'zod';
import { db } from '../../../../src/db';
import { chatMessages, rides, users } from '../../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '../../../../lib/logger';
import * as errors from '@/lib/errors';

const schema = z.object({
  content: z.string().min(1).max(1000),
});

const CHAT_ENABLED_STATUSES = ['matched', 'driver_arriving', 'in_progress'] as const;

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const rideId = segments[segments.indexOf('ride') + 1];
    if (!rideId) return Response.json({ error: 'missing_ride_id', message: 'Ride ID is required' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(req);

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'invalid_body', message: 'Invalid request body' }, { status: 400 });

    const { content } = parsed.data;

    const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    if (ride.user_id !== user.id && ride.driver_id !== user.id) {
      return Response.json({ error: 'not_ride_participant', message: 'You are not a participant in this ride' }, { status: 403 });
    }

    if (!(CHAT_ENABLED_STATUSES as readonly string[]).includes(ride.status)) {
      return Response.json({ error: 'chat_closed', message: 'Chat conversation closed' }, { status: 403 });
    }

    const [msg] = await db.insert(chatMessages).values({
      ride_id: rideId,
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
          ride_id: rideId,
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
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[ride/message] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
