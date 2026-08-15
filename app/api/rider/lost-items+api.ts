import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, lostItems, rides } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const reportSchema = z.object({
  ride_id: z.string().uuid(),
  item_description: z.string().min(1).max(1000),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [rider] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!rider) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, reportSchema);
    if (!parsed.ok) return parsed.response;

    const [ride] = await db.select({ id: rides.id, driver_id: rides.driver_id, user_id: rides.user_id, completed_at: rides.completed_at })
      .from(rides).where(eq(rides.id, parsed.data.ride_id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.user_id !== rider.id) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    if (!ride.completed_at || Date.now() - new Date(ride.completed_at).getTime() > 86400000) {
      return Response.json({ error: 'report_window_expired', message: 'Lost items must be reported within 24 hours' }, { status: 422 });
    }

    await db.insert(lostItems).values({
      ride_id: parsed.data.ride_id,
      rider_id: rider.id,
      driver_id: ride.driver_id!,
      item_description: parsed.data.item_description,
    });

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/lost-items] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [rider] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!rider) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const items = await db.select().from(lostItems)
      .where(eq(lostItems.rider_id, rider.id))
      .orderBy(desc(lostItems.reported_at));

    return Response.json({ items });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/lost-items] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
