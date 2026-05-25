import { db } from '../../../../src/db';
import { chatMessages, rides, users } from '../../../../src/db/schema';
import { eq, and, lt, desc } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '../../../../lib/auth';
import { logger } from '../../../../lib/logger';

const PAGE_SIZE = 50;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const decoded = await verifyFirebaseIdToken(req);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, decoded.uid)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, params.id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });

    if (ride.user_id !== user.id && ride.driver_id !== user.id) {
      return Response.json({ error: 'not_ride_participant' }, { status: 403 });
    }

    const url = new URL(req.url);
    const before = url.searchParams.get('before');

    const conditions = [eq(chatMessages.ride_id, params.id)];
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
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[ride/messages] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
