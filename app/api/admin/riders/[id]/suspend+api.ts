import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const suspendSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    await requireAdminPermission('safety.write')(request);
    const parsed = await parseJsonBody(request, suspendSchema);
    if (!parsed.ok) return parsed.response;

    await db.update(users)
      .set({ account_status: 'suspended' })
      .where(and(eq(users.id, id), eq(users.role, 'rider')));

    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/riders/suspend] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
