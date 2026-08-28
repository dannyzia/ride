import { db } from '@/src/db';
import { lostItems } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const mediateSchema = z.object({
  item_id: z.string().uuid(),
  admin_mediation: z.literal(true),
  return_method: z.enum(['driver_returns', 'rider_pickup', 'drop_at_hub', 'undeliverable']).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('support.write')(request);
    const items = await db.select().from(lostItems).orderBy(desc(lostItems.reported_at));
    return Response.json({ items });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/lost-items] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminPermission('support.write')(request);
    const parsed = await parseJsonBody(request, mediateSchema);
    if (!parsed.ok) return parsed.response;

    const update: Record<string, any> = { admin_mediation: true, updated_at: new Date() };
    if (parsed.data.return_method) update.return_method = parsed.data.return_method;

    await db.update(lostItems).set(update).where(eq(lostItems.id, parsed.data.item_id));
    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/lost-items] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
