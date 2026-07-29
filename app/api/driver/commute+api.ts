import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, drivers, driverCommutePreferences } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const schema = z.object({
  destination_lat: z.number(),
  destination_lng: z.number(),
  destination_address: z.string(),
  max_deviation_meters: z.number().default(2000),
  active: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return parsed.response;

    const existing = await db.select({ id: driverCommutePreferences.id }).from(driverCommutePreferences)
      .where(eq(driverCommutePreferences.driver_id, driver.id)).limit(1);

    const vals = {
      driver_id: driver.id,
      destination_lat: parsed.data.destination_lat.toString(),
      destination_lng: parsed.data.destination_lng.toString(),
      destination_address: parsed.data.destination_address,
      max_deviation_meters: parsed.data.max_deviation_meters,
      active: parsed.data.active,
    };

    if (existing.length > 0) {
      await db.update(driverCommutePreferences).set({ ...vals, updated_at: new Date() }).where(eq(driverCommutePreferences.id, existing[0].id));
    } else {
      await db.insert(driverCommutePreferences).values(vals as any);
    }

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/commute] POST error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const [pref] = await db.select().from(driverCommutePreferences)
      .where(eq(driverCommutePreferences.driver_id, driver.id)).limit(1);
    return Response.json({ commute: pref || null });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/commute] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    await db.delete(driverCommutePreferences)
      .where(eq(driverCommutePreferences.driver_id, driver.id));
    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/commute] DELETE error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
