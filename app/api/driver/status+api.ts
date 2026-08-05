import { db } from '@/src/db';
import { drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getH3Cell } from '@/lib/h3';
import { z } from 'zod';

const statusSchema = z.object({
  is_online: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const body = await request.json();
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error' }, { status: 400 });
    }

    const { is_online, lat, lng } = parsed.data;

    // BUG 6 FIX: Reject going online if driver not approved
    if (is_online) {
      const [driver] = await db.select({ id: drivers.id, status: drivers.status })
        .from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
      if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });
      if (driver.status !== 'active') {
        return Response.json({
          error: 'not_approved',
          message: `Your account status is "${driver.status}". Only "active" drivers can go online.`,
        }, { status: 403 });
      }
    }

    // BUG 7 FIX: Save location and compute H3 cell when going online
    const setClause: Record<string, unknown> = { is_online, updated_at: new Date() };
    if (is_online && typeof lat === 'number' && typeof lng === 'number') {
      setClause.last_location_lat = String(lat);
      setClause.last_location_lng = String(lng);
      setClause.last_location_at = new Date();
      setClause.h3_cell_res9 = getH3Cell(lat, lng);
    }

    await db.update(drivers).set(setClause).where(eq(drivers.user_id, user.id));

    logger.info('[driver/status] updated', { userId: user.id, is_online, hasGps: lat != null });
    return Response.json({ success: true, is_online });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/status] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
