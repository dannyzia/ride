import { evaluateCancellation } from '@/lib/cancellation';
import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    // M-31: the cancellation preview exposes fee state for a ride — it must
    // only be readable by the ride's rider.
    const [ride] = await db
      .select({ user_id: rides.user_id })
      .from(rides)
      .where(eq(rides.id, id))
      .limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.user_id !== user.id) {
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    }

    const { feeBdt, reason } = await evaluateCancellation(id, 'rider');
    return Response.json({ fee_bdt: feeBdt, reason });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[cancel-preview] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
