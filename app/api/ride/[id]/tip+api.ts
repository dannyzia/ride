import { db } from '@/src/db';
import { rides, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const tipSchema = z.object({
  amount_bdt: z.number().int().min(1),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const user = await verifySupabaseToken(request);

    if (!z.string().uuid().safeParse(id).success) return Response.json({ error: 'invalid_ride_id' }, { status: 400 });

    const body = await parseJsonBody(request, tipSchema);
    if (!body.ok) return body.response;
    const { amount_bdt } = body.data;

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });

    if (ride.status !== 'completed') {
      return Response.json({ error: 'ride_not_completed', message: `Ride status is ${ride.status}` }, { status: 422 });
    }

    if (ride.user_id !== dbUser.id) {
      return Response.json({ error: 'not_rider' }, { status: 403 });
    }

    if (ride.tip_bdt !== null && ride.tip_bdt > 0) {
      return Response.json({ error: 'already_tipped' }, { status: 409 });
    }

    await db.update(rides).set({ tip_bdt: amount_bdt }).where(eq(rides.id, id));

    logger.info('[ride/tip] tip submitted', { rideId: id, amount_bdt });
    return Response.json({ success: true, tip_bdt: amount_bdt });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[ride/tip] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
