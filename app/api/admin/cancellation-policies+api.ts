import { db } from '@/src/db';
import { cancellationPolicies } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const policySchema = z.object({
  name: z.string().min(1).max(100),
  canceller_role: z.string().min(1),
  ride_status: z.string().min(1),
  time_threshold_seconds: z.number().int().nonnegative(),
  fee_type: z.string().min(1),
  fee_amount_bdt: z.number().int().nonnegative(),
  max_fee_bdt: z.number().int().nonnegative(),
  is_active: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const rows = await db.select().from(cancellationPolicies).orderBy(desc(cancellationPolicies.priority));
    return Response.json({ policies: rows });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/cancellation-policies] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const parsed = await parseJsonBody(request, policySchema);
    if (!parsed.ok) return parsed.response;
    const [policy] = await db.insert(cancellationPolicies).values(parsed.data).returning();
    return Response.json({ policy });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/cancellation-policies] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

/** PATCH — activate/deactivate a policy. Policies are retired, never deleted. */
export async function PATCH(request: Request) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, is_active } = parsed.data;
    const [updated] = await db
      .update(cancellationPolicies)
      .set({ is_active, updated_at: new Date() })
      .where(eq(cancellationPolicies.id, id))
      .returning();
    if (!updated) return Response.json({ error: 'not_found', message: 'Policy not found' }, { status: 404 });
    return Response.json({ policy: updated });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/cancellation-policies] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
