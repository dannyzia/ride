/**
 * PATCH /api/delivery/presence — S6 delivery-man online gate (F-15).
 *
 * The Delivery Man has no drivers row (couriers row is their presence
 * store), and NOTHING wrote couriers.is_online before this route — the
 * dispatch candidate pool requires is_online=true, so this is the switch
 * that puts a courier in (or out of) the offer distribution.
 *
 * Client duties (F-15): location permission denied → forced offline + banner
 * (the client simply flips online:false here). Stale presence is a pool-side
 * concern; last_seen_at is stamped on every call.
 */
import { requireDeliveryAgent } from '@/lib/marketplaceRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { db } from '@/src/db';
import { couriers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const presenceSchema = z.object({
  online: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function PATCH(request: Request) {
  try {
    const auth = await requireDeliveryAgent(request);
    const parsed = await parseJsonBody(request, presenceSchema);
    if (!parsed.ok) return parsed.response;
    const { online, lat, lng } = parsed.data;

    if (auth.kind !== 'courier' || !auth.courier) {
      // Drivers ride on the existing heartbeat (drivers.is_online) — turning
      // the Deliveries toggle ON/OFF is the driver's own switch (Amendment 2).
      return Response.json(
        { error: 'not_courier', message: 'Driver presence follows the ride heartbeat' },
        { status: 409 },
      );
    }

    await db
      .update(couriers)
      .set({
        is_online: online,
        ...(lat !== undefined ? { last_lat: String(lat) } : {}),
        ...(lng !== undefined ? { last_lng: String(lng) } : {}),
        last_seen_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(couriers.id, auth.courier.id));

    return Response.json({ success: true, online }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return Response.json({ error: 'forbidden', message: 'Not an active delivery agent' }, { status });
    }
    logger.error('[delivery/presence] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
