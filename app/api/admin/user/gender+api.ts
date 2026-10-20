// POST /api/admin/user/gender — S8 §4.2 universal admin correction endpoint.
//
// For non-driver users (riders, shop owners, fleet members) who set the wrong
// gender via the write-once PATCH. Guarded by staff.manage (owner, admin).
// Dual-writes drivers.gender when a drivers row exists (fires
// trg_drivers_gender_reset — re-verification then goes through the driver
// queue), plus a structured audit entry, all in one transaction.
import { db } from '@/src/db';
import {
  users,
  drivers,
  auditLogs,
} from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  user_id: z.string().uuid(),
  gender: z.enum(['male', 'female', 'other']),
  reason: z.string().min(5).max(500),
});

export async function POST(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission('staff.manage')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { user_id, gender, reason } = result.data;

    const [user] = await db
      .select({ id: users.id, gender: users.gender })
      .from(users)
      .where(eq(users.id, user_id))
      .limit(1);
    if (!user) {
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    }

    const oldGender = user.gender;

    const outcome = await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ gender, updated_at: new Date() })
        .where(eq(users.id, user_id));

      // Dual-write when the user also drives (trigger resets that row's
      // verification flags; the driver queue re-stamps them).
      const driverRows = await tx
        .update(drivers)
        .set({ gender, updated_at: new Date() })
        .where(eq(drivers.user_id, user_id))
        .returning({ id: drivers.id });

      await tx.insert(auditLogs).values({
        actor_user_id: dbUser.id,
        action: 'user_gender_corrected',
        entity_type: 'user',
        entity_id: user_id,
        old_value: { gender: oldGender },
        new_value: { gender, reason, driver_rows_updated: driverRows.length },
        ip_address: request.headers?.get?.('x-forwarded-for') ?? null,
        user_agent: request.headers?.get?.('user-agent') ?? null,
      });

      return { driver_rows_updated: driverRows.length };
    });

    logger.info('[admin/user/gender] corrected', {
      userId: user_id,
      oldGender,
      newGender: gender,
      adminId: dbUser.id,
    });

    return Response.json(
      { user_id, gender, driver_rows_updated: outcome.driver_rows_updated },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/user/gender] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
