import { db } from '@/src/db';
import { drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getH3Cell } from '@/lib/h3';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const statusSchema = z.object({
  is_online: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, statusSchema);
    if (!parsed.ok) return parsed.response;

    const { is_online, lat, lng } = parsed.data;

    // N5: (0, 0) is Null Island — the Gulf of Guinea — not a real position.
    // The client used to send 0,0 when GPS wasn't fixed yet, which would have
    // indexed the driver into an h3 cell hundreds of km away. Only enforced
    // when going ONLINE (coordinates are irrelevant when going offline).
    if (is_online && lat === 0 && lng === 0) {
      return Response.json({ error: 'invalid_coordinates', message: 'Location not available — enable GPS before going online' }, { status: 400 });
    }

    // Always resolve the driver row — the offline path previously updated
    // zero rows (no driver-existence check) and still returned success.
    const [driver] = await db.select({ id: drivers.id, status: drivers.status })
      .from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    // Reject going online if driver not approved
    if (is_online && driver.status !== 'active') {
      return Response.json({
        error: 'not_approved',
        message: `Your account status is "${driver.status}". Only "active" drivers can go online.`,
      }, { status: 403 });
    }

    // Save location and compute H3 cell when going online
    const setClause: Record<string, unknown> = { is_online, updated_at: new Date() };
    if (is_online && typeof lat === 'number' && typeof lng === 'number') {
      setClause.last_location_lat = String(lat);
      setClause.last_location_lng = String(lng);
      setClause.last_location_at = new Date();
      setClause.h3_cell_res9 = getH3Cell(lat, lng);
    }

    await db.update(drivers).set(setClause).where(eq(drivers.id, driver.id));

    logger.info('[driver/status] updated', { userId: user.id, is_online, hasGps: lat != null });
    return Response.json({ success: true, is_online });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/status] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
