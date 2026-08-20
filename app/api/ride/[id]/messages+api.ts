import { db } from '@/src/db';
import { chatMessages, rides, users } from '@/src/db/schema';
import { eq, and, lt, desc } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const PAGE_SIZE = 50;

export async function GET(request: Request, { id }: { id: string }) {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid ride ID' }, { status: 400 });
    }
    const rideId = id;

    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    if (ride.user_id !== user.id && ride.driver_id !== user.id) {
      return Response.json({ error: 'not_ride_participant', message: 'You are not a participant in this ride' }, { status: 403 });
    }

    const url = new URL(request.url);
    const before = url.searchParams.get('before');

    const conditions = [eq(chatMessages.ride_id, rideId)];
    if (before) {
      conditions.push(lt(chatMessages.created_at, new Date(before)));
    }

    const messages = await db.select()
      .from(chatMessages)
      .where(and(...conditions))
      .orderBy(desc(chatMessages.created_at))
      .limit(PAGE_SIZE + 1); // fetch one extra to check has_more

    const hasMore = messages.length > PAGE_SIZE;
    if (hasMore) messages.pop(); // remove the extra item

    return Response.json({
      messages: messages.reverse(),
      has_more: hasMore,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[ride/messages] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
