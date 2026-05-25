import { z } from 'zod';
import { db } from '../../../src/db';
import { chatMessages, rides, users } from '../../../src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '../../../lib/auth';

const sendSchema = z.object({
  ride_id: z.string().uuid(),
  content: z.string().min(1).max(1000),
});

export async function POST(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);
    const body = await sendSchema.parseAsync(await request.json());

    // Resolve Firebase uid to DB user id
    const [sender] = await db.select({ id: users.id }).from(users).where(eq(users.firebase_uid, decoded.uid)).limit(1);
    if (!sender) return Response.json({ error: 'user_not_found' }, { status: 404 });

    // Verify sender is participant in this ride
    const [ride] = await db.select().from(rides).where(eq(rides.id, body.ride_id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });
    if (ride.user_id !== sender.id && ride.driver_id !== sender.id) {
      return Response.json({ error: 'not_ride_participant' }, { status: 403 });
    }

    const [msg] = await db.insert(chatMessages).values({
      ride_id: body.ride_id,
      sender_id: sender.id,
      content: body.content,
    }).returning();

    return Response.json({ message: msg }, { status: 201 });
  } catch (e: any) {
    if (e.name === 'ZodError') return Response.json({ error: e.issues }, { status: 400 });
    return Response.json({ error: e.message ?? 'chat_failed' }, { status: 401 });
  }
}

export async function GET(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);
    const url = new URL(request.url);
    const rideId = url.searchParams.get('ride_id');
    if (!rideId) return Response.json({ error: 'ride_id_required' }, { status: 400 });

    const messages = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.ride_id, rideId))
      .orderBy(chatMessages.created_at)
      .limit(100);

    return Response.json({ messages });
  } catch (e: any) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
}
