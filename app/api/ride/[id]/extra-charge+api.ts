import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, drivers, rides, rideExtraCharges, supportTickets } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const chargeSchema = z.object({
  type: z.enum(['toll', 'parking']),
  amount_bdt: z.number().int().positive().max(50000),
  description: z.string().max(500).optional(),
});

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);

    const [ride] = await db.select({ user_id: rides.user_id, driver_id: rides.driver_id })
      .from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });
    const isRider = ride.user_id === dbUser.id;
    const isDriver = driver && ride.driver_id === driver.id;
    if (!isRider && !isDriver) {
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    }

    const charges = await db.select().from(rideExtraCharges)
      .where(eq(rideExtraCharges.ride_id, id))
      .orderBy(desc(rideExtraCharges.created_at));
    return Response.json({ charges });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[extra-charge] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [ride] = await db.select({ id: rides.id, driver_id: rides.driver_id }).from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });
    if (ride.driver_id !== driver.id) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    const parsed = await parseJsonBody(request, chargeSchema);
    if (!parsed.ok) return parsed.response;

    await db.insert(rideExtraCharges).values({
      ride_id: id,
      type: parsed.data.type,
      amount_bdt: parsed.data.amount_bdt,
      description: parsed.data.description,
      submitted_by_driver: true,
    });

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[extra-charge] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

const approveSchema = z.object({
  charge_id: z.string().uuid(),
  action: z.enum(['approve', 'dispute']),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const uuidId = z.string().uuid().safeParse(id);
    if (!uuidId.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);

    const parsed = await parseJsonBody(request, approveSchema);
    if (!parsed.ok) return parsed.response;

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [charge] = await db.select().from(rideExtraCharges).where(eq(rideExtraCharges.id, parsed.data.charge_id)).limit(1);
    if (!charge || charge.ride_id !== id) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });
    if (charge.status !== 'pending') return Response.json({ error: 'already_resolved', message: 'Ticket already resolved' }, { status: 409 });

    const [ride] = await db.select({ user_id: rides.user_id }).from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride || ride.user_id !== user.id) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    const newStatus = parsed.data.action === 'approve' ? 'approved' : 'disputed';
    await db.update(rideExtraCharges).set({ status: newStatus, resolved_at: new Date() }).where(eq(rideExtraCharges.id, parsed.data.charge_id));

    if (newStatus === 'disputed') {
      await db.insert(supportTickets as any).values({
        user_id: supabaseUser.id,
        ride_id: id,
        category: 'fare_dispute',
        subject: `Disputed ${charge.type} charge: ৳${(charge.amount_bdt / 100).toFixed(0)}`,
        message: `Charge ID: ${charge.id}\nType: ${charge.type}\nAmount: ${charge.amount_bdt}\nDescription: ${charge.description ?? ''}`,
        priority: 'medium',
      });
    }

    logger.info('[extra-charge] resolved', { charge_id: charge.id, status: newStatus });
    return Response.json({ success: true, status: newStatus });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[extra-charge] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
