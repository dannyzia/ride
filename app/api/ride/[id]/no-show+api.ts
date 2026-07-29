import { db } from '@/src/db';
import { rides, users } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { evaluateCancellation, applyCancellationFee } from '@/lib/cancellation';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid' }, { status: 400 });

    const { dbUser } = await requireRole('driver')(request);
    const driverId = dbUser.id;

    const [ride] = await db
      .select({ id: rides.id, driver_id: rides.driver_id, user_id: rides.user_id, status: rides.status })
      .from(rides)
      .where(and(eq(rides.id, id), eq(rides.driver_id, driverId)))
      .limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });
    if (!['matched', 'driver_arriving', 'driver_arrived'].includes(ride.status)) {
      return Response.json({ error: 'invalid_status', message: `Cannot mark no-show in status: ${ride.status}` }, { status: 409 });
    }

    const { feeBdt } = await evaluateCancellation(id, 'rider');
    await applyCancellationFee(id, feeBdt);

    await db.update(rides)
      .set({ status: 'cancelled', cancelled_by: 'driver', cancel_reason: 'rider_no_show', cancellation_fee_bdt: feeBdt > 0 ? feeBdt : null })
      .where(eq(rides.id, id));

    logger.info('[no-show] driver marked rider no-show', { ride_id: id, driver_id: driverId, fee_bdt: feeBdt });
    return Response.json({ success: true, fee_bdt: feeBdt });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[no-show] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
