import { db } from '../../../../src/db';
import { rides, users } from '../../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '../../../../lib/logger';

const CHAT_ACTIVE_STATUSES = ['matched', 'driver_arriving', 'in_progress'];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const rideId = segments[segments.indexOf('ride') + 1];
    if (!rideId) return Response.json({ error: 'missing_ride_id' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(req);

    const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });

    if (ride.user_id !== user.id && ride.driver_id !== user.id) {
      return Response.json({ error: 'not_ride_participant' }, { status: 403 });
    }

    const isRider = ride.user_id === user.id;
    const otherUserId = isRider ? ride.driver_id : ride.user_id;

    let otherUserName = 'Driver';
    let otherUserPhone = '';

    if (otherUserId) {
      const [otherUser] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, otherUserId)).limit(1);
      if (otherUser) {
        otherUserName = otherUser.name ?? (isRider ? 'Driver' : 'Customer');
        otherUserPhone = otherUser.phone ?? '';
      }
    }

    return Response.json({
      current_user_id: user.id,
      current_user_role: user.role,
      other_user_name: otherUserName,
      other_user_phone: otherUserPhone,
      ride_active: CHAT_ACTIVE_STATUSES.includes(ride.status),
      ride_status: ride.status,
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[ride/details] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
