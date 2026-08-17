import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, drivers, rides, pricing } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });
    if (ride.driver_id !== driver.id) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    if (!ride.wait_start_at) return Response.json({ error: 'wait_not_started', message: 'Wait period has not started' }, { status: 400 });

    const [priceTier] = await db.select().from(pricing)
      .where(and(eq(pricing.vehicle_type, ride.vehicle_type as any), eq(pricing.zone_id, ride.zone_id), eq(pricing.is_active, true)))
      .limit(1);
    const freeMinutes = priceTier?.free_wait_minutes ?? 3;
    const feePerMin = priceTier?.wait_fee_per_minute_bdt ?? 200;

    const waitMs = Date.now() - new Date(ride.wait_start_at).getTime();
    const waitMinutes = Math.floor(waitMs / 60000);
    const chargeableMinutes = Math.max(0, waitMinutes - freeMinutes);
    const waitFeePaisa = chargeableMinutes * feePerMin;

    await db.update(rides).set({
      wait_end_at: new Date(),
      wait_fee_bdt: waitFeePaisa,
    }).where(eq(rides.id, id));

    return Response.json({ success: true, total_wait_minutes: waitMinutes, free_minutes: freeMinutes, chargeable_minutes: chargeableMinutes, wait_fee_bdt: waitFeePaisa });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[wait-end] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
