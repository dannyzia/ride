import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, drivers, driverBlocklists } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const blockSchema = z.object({
  driver_id: z.string().uuid(),
  reason: z.enum(['rude_behavior', 'unsafe_driving', 'overcharged', 'harassment', 'no_show', 'other']).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [rider] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!rider) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, blockSchema);
    if (!parsed.ok) return parsed.response;

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, parsed.data.driver_id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    await db.insert(driverBlocklists).values({
      rider_id: rider.id,
      driver_id: parsed.data.driver_id,
      reason: parsed.data.reason,
    }).onConflictDoNothing();

    return Response.json({ success: true, blocked: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/block] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [rider] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!rider) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const url = new URL(request.url);
const driverId = url.searchParams.get('driver_id');
     if (!driverId) return Response.json({ error: 'driver_id_required', message: 'Driver ID is required' }, { status: 400 });
     const uuidParam = z.string().uuid().safeParse(driverId);
     if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

     await db.delete(driverBlocklists)
      .where(and(eq(driverBlocklists.rider_id, rider.id), eq(driverBlocklists.driver_id, driverId)));

    return Response.json({ success: true, blocked: false });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/block] DELETE error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [rider] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!rider) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const blocks = await db.select().from(driverBlocklists)
      .where(eq(driverBlocklists.rider_id, rider.id))
      .orderBy(desc(driverBlocklists.created_at));

    return Response.json({ blocked_drivers: blocks });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/block] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
