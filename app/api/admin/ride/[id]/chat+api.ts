import { db } from '../../../../../src/db';
import { chatMessages, rides, users, drivers } from '../../../../../src/db/schema';
import { eq, asc } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '../../../../../lib/auth';
import { logger } from '../../../../../lib/logger';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const decoded = await verifyFirebaseIdToken(req);

    const [admin] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.auth_uid, decoded.uid)).limit(1);
    if (!admin) return Response.json({ error: 'user_not_found' }, { status: 404 });
    if (admin.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, params.id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });

    const [rider] = await db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(eq(users.id, ride.user_id)).limit(1);

    let driverUser = null;
    if (ride.driver_id) {
      const [result] = await db.select({ id: users.id, name: users.name, phone: users.phone })
        .from(users)
        .innerJoin(drivers, eq(drivers.user_id, users.id))
        .where(eq(drivers.id, ride.driver_id))
        .limit(1);
      driverUser = result ?? null;
    }

    const messages = await db.select({
      id: chatMessages.id,
      sender_id: chatMessages.sender_id,
      content: chatMessages.content,
      created_at: chatMessages.created_at,
    }).from(chatMessages)
      .where(eq(chatMessages.ride_id, params.id))
      .orderBy(asc(chatMessages.created_at)); // chronologically for export

    // Enrich messages with sender info
    const enriched = messages.map((m) => ({
      ...m,
      sender_name: m.sender_id === rider?.id ? (rider?.name ?? 'Rider') : (driverUser?.name ?? 'Driver'),
      sender_role: m.sender_id === rider?.id ? 'rider' : 'driver',
    }));

    return Response.json({
      ride_id: params.id,
      ride_status: ride.status,
      ride_created_at: ride.created_at,
      rider: rider ? { name: rider.name, phone: rider.phone } : null,
      driver: driverUser,
      messages: enriched,
      message_count: enriched.length,
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/ride/chat] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
