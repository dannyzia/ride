// Auth: verifySupabaseToken via requireRole
import { db } from '@/src/db';
import { drivers, documents, users } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const reviewSchema = z.object({
  driver_id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  rejection_reason: z.string().max(500).optional(),
  document_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);

    const result = await parseJsonBody(request, reviewSchema);
    if (!result.ok) return result.response;

    const { driver_id, action, rejection_reason, document_ids } = result.data;

    const [driver] = await db.select()
      .from(drivers)
      .where(eq(drivers.id, driver_id))
      .limit(1);

    if (!driver) {
      return Response.json({ error: 'driver_not_found' }, { status: 404 });
    }

    if (action === 'approve') {
      await db.transaction(async (tx) => {
        await tx.update(drivers)
          .set({ status: 'temporary', updated_at: new Date() })
          .where(eq(drivers.id, driver_id));

        if (document_ids && document_ids.length > 0) {
          await tx.update(documents)
            .set({
              status: 'approved',
              reviewed_by: admin.id,
              reviewed_at: new Date(),
            })
            .where(and(
              inArray(documents.id, document_ids),
              eq(documents.driver_id, driver_id),
            ));
        }
      });
    } else {
      await db.transaction(async (tx) => {
        await tx.update(drivers)
          .set({ status: 'rejected', updated_at: new Date() })
          .where(eq(drivers.id, driver_id));

        if (document_ids && document_ids.length > 0) {
          await tx.update(documents)
            .set({
              status: 'rejected',
              reviewed_by: admin.id,
              reviewed_at: new Date(),
              rejection_reason: rejection_reason ?? null,
            })
            .where(and(
              inArray(documents.id, document_ids),
              eq(documents.driver_id, driver_id),
            ));
        }
      });
    }

    return Response.json({ success: true, status: action === 'approve' ? 'temporary' : 'rejected' });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/verify-driver] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);

    const pendingDrivers = await db.select({
      id: drivers.id,
      user_id: drivers.user_id,
      vehicle_type: drivers.vehicle_type,
      status: drivers.status,
      created_at: drivers.created_at,
      user_name: users.name,
      user_phone: users.phone,
    })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(inArray(drivers.status, ['pending', 'rejected']))
      .orderBy(drivers.created_at);

    return Response.json({ drivers: pendingDrivers });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/verify-driver] list error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
