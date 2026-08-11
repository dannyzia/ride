import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { rideExtraCharges } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function POST(request: Request, { id, chargeId }: { id: string; chargeId: string }) {
  try {
    const uuidId = z.string().uuid().safeParse(id);
    const uuidCharge = z.string().uuid().safeParse(chargeId);
    if (!uuidId.success || !uuidCharge.success) return Response.json({ error: 'invalid_uuid' }, { status: 400 });

    const _supabaseUser = await verifySupabaseToken(request);

    const [charge] = await db.select().from(rideExtraCharges).where(eq(rideExtraCharges.id, chargeId)).limit(1);
    if (!charge || charge.ride_id !== id) return Response.json({ error: 'not_found' }, { status: 404 });
    if (charge.status !== 'pending') return Response.json({ error: 'already_resolved' }, { status: 409 });

    await db.update(rideExtraCharges).set({ status: 'approved', resolved_at: new Date() }).where(eq(rideExtraCharges.id, chargeId));

    logger.info('[extra-charge/approve] approved', { charge_id: chargeId, ride_id: id, amount_bdt: charge.amount_bdt });
    return Response.json({ success: true, amount_bdt: charge.amount_bdt });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[extra-charge/approve] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
