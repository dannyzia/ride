import { db } from '@/src/db';
import { driverPreferences, drivers, users, preferences } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

const updateSchema = z.object({
  preference_ids: z.array(z.string().uuid()).max(20),
});

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const rows = await db.select({
      preference_id: driverPreferences.preference_id,
      name: preferences.name,
      display_label_en: preferences.display_label_en,
      display_label_bn: preferences.display_label_bn,
      icon: preferences.icon,
      charge_bdt: preferences.charge_bdt,
      affects_matching: preferences.affects_matching,
    })
      .from(driverPreferences)
      .innerJoin(preferences, eq(preferences.id, driverPreferences.preference_id))
      .where(and(
        eq(driverPreferences.driver_id, driver.id),
        eq(preferences.is_active, true),
      ));

    return Response.json({ preferences: rows });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/preferences] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;

    const { preference_ids } = parsed.data;

    // Validate all preference IDs exist and are active
    if (preference_ids.length > 0) {
      const existingPrefs = await db.select({ id: preferences.id })
        .from(preferences)
        .where(and(
          inArray(preferences.id, preference_ids),
          eq(preferences.is_active, true),
        ));
      if (existingPrefs.length !== preference_ids.length) {
        return Response.json({ error: 'invalid_preference_ids', message: 'Invalid preference selection' }, { status: 400 });
      }
    }

    // Replace all: delete existing, insert new
    await db.transaction(async (tx) => {
      await tx.delete(driverPreferences).where(eq(driverPreferences.driver_id, driver.id));
      if (preference_ids.length > 0) {
        await tx.insert(driverPreferences).values(
          preference_ids.map(prefId => ({
            driver_id: driver.id,
            preference_id: prefId,
          }))
        );
      }
    });

    logger.info('[driver/preferences] updated', { driverId: driver.id, count: preference_ids.length });

    return Response.json({ updated: true, preference_ids });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/preferences] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
