import { db } from '@/src/db';
import { fraudFlags } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const VALID_STATUSES = ['warned', 'escalated', 'blocked', 'resolved'] as const;

const STATUS_ORDER: Record<string, number> = {
  open: 0,
  warned: 1,
  escalated: 2,
  blocked: 3,
  resolved: 4,
};

const patchSchema = z.object({
  status: z.enum(VALID_STATUSES),
  resolved_by: z.string().uuid().optional(),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    await requireAdminPermission('review.write')(request);

    const uuidResult = z.string().uuid().safeParse(id);
    if (!uuidResult.success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid flag ID' }, { status: 400 });
    }

    const parsed = await parseJsonBody(request, patchSchema);
    if (!parsed.ok) return parsed.response;

    const [flag] = await db
      .select()
      .from(fraudFlags)
      .where(eq(fraudFlags.id, id))
      .limit(1);

    if (!flag) {
      return Response.json({ error: 'not_found', message: 'Fraud flag not found' }, { status: 404 });
    }

    const currentOrder = STATUS_ORDER[flag.status] ?? -1;
    const targetOrder = STATUS_ORDER[parsed.data.status] ?? -1;

    // Allow blocked→resolved (admin resolution) but not backwards otherwise
    const isBlockedToResolved = flag.status === 'blocked' && parsed.data.status === 'resolved';
    if (!isBlockedToResolved && targetOrder <= currentOrder) {
      return Response.json(
        { error: 'invalid_transition', message: `Cannot transition from '${flag.status}' to '${parsed.data.status}'` },
        { status: 400 },
      );
    }

    const updateValues: {
      status: typeof VALID_STATUSES[number];
      updated_at: Date;
      resolved_by?: string;
      resolved_at?: Date;
    } = {
      status: parsed.data.status,
      updated_at: new Date(),
    };

    if (parsed.data.status === 'resolved') {
      updateValues.resolved_at = new Date();
      if (parsed.data.resolved_by) {
        updateValues.resolved_by = parsed.data.resolved_by;
      }
    }

    const [updated] = await db
      .update(fraudFlags)
      .set(updateValues)
      .where(eq(fraudFlags.id, id))
      .returning();

    logger.info('[admin/fraud-flags] flag updated', {
      flag_id: id,
      from: flag.status,
      to: parsed.data.status,
    });

    return Response.json({ flag: updated });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/fraud-flags] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
