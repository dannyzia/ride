// POST /api/admin/driver/suspend
// F15-API-02. Suspend an active driver with reason.
import { db } from '@/src/db';
import { drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { notifyAccountStatus } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  driver_id: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireAdminPermission('safety.write')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { driver_id, reason } = result.data;

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driver_id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    await db
      .update(drivers)
      .set({ status: 'suspended', is_online: false, updated_at: new Date() })
      .where(eq(drivers.id, driver_id));

    logger.info('[admin/driver/suspend] suspended', {
      driverId: driver_id,
      previousStatus: driver.status,
      reason,
      adminId: admin.id,
    });

    // Plan §B13 broadcast matrix — account_status push to the driver
    // (fire-and-forget; never fails the admin action).
    notifyAccountStatus(driver.user_id, true, reason);

    // F-9.2 (theme9 stale-eligibility audit): tell the dispatch server to
    // force the suspended driver offline — the existing /internal/driver/
    // force-offline endpoint sends admin:suspended, closes the socket, evicts
    // the H3 index, resolves any outstanding offer, and flips is_online in
    // DB. Without this call the suspended driver's socket stays connected
    // (heartbeats keep flowing) until the app notices the push. Fire-and-
    // forget with a short timeout: never fails the admin action; the DB
    // status guard (F-9.1) still blocks dispatch eligibility either way.
    const wsPort = process.env.UTILS_SERVER_PORT ?? '3001';
    const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
    if (internalSecret) {
      try {
        await fetch(`http://127.0.0.1:${wsPort}/internal/driver/force-offline`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${internalSecret}`,
          },
          signal: AbortSignal.timeout(5_000),
          body: JSON.stringify({ driver_id, reason: `suspended: ${reason}` }),
        });
      } catch (e: unknown) {
        logger.warn('[admin/driver/suspend] force-offline notification failed (non-blocking)', {
          driverId: driver_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return Response.json({ driver_id, status: 'suspended' });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/suspend] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
