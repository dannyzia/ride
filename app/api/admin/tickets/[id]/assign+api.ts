import { db } from '@/src/db';
import { supportTickets } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const assignSchema = z.object({
  assigned_to: z.string().uuid(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    await requireAdminPermission('finance.write')(request);
    const parsed = await parseJsonBody(request, assignSchema);
    if (!parsed.ok) return parsed.response;

    await db.update(supportTickets)
      .set({ assigned_to: parsed.data.assigned_to, updated_at: new Date() })
      .where(eq(supportTickets.id, id));

    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/tickets/assign] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
