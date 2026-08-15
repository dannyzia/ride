import { db } from '@/src/db';
import { driverPayoutMethods, drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const payoutSchema = z.object({
  account_number: z.string().regex(/^01\d{9}$/, 'Invalid bKash number'),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id, name: users.name })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, payoutSchema);
    if (!parsed.ok) return parsed.response;

    const { account_number } = parsed.data;

    const payoutMethod = await db.transaction(async (tx) => {
      // Deactivate all prior payout methods for this driver
      await tx.update(driverPayoutMethods)
        .set({ is_default: false, is_active: false, updated_at: new Date() })
        .where(eq(driverPayoutMethods.driver_id, driver.id));

      const [row] = await tx.insert(driverPayoutMethods).values({
        driver_id: driver.id,
        method_type: 'bkash',
        account_number,
        account_name: user.name,
        is_default: true,
        is_active: true,
      }).returning();

      return row;
    });

    logger.info('[driver/payout-method] bkash payout method saved', { driverId: driver.id });

    return Response.json({ payout_method: payoutMethod }, { status: 201 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/payout-method] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
