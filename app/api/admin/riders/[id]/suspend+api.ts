import { adminErrorResponse } from '@/lib/adminRoute';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const suspendSchema = z.object({
  account_status: z.enum(['active', 'suspended']).optional().default('suspended'),
  reason: z.string().min(1).max(500).optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    await requireAdminPermission('safety.write')(request);
    const parsed = await parseJsonBody(request, suspendSchema);
    if (!parsed.ok) return parsed.response;

    // C2-1: persist the reason so the 403 account_suspended surfaces it.
    // Restoring clears that reason and returns the rider account to active.
    const accountStatus = parsed.data.account_status;
    await db.update(users)
      .set({
        account_status: accountStatus,
        suspension_reason: accountStatus === 'suspended' ? parsed.data.reason ?? null : null,
        updated_at: new Date(),
      })
      .where(and(eq(users.id, id), eq(users.role, 'rider')));

    return Response.json({ success: true, account_status: accountStatus });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    return adminErrorResponse(err, '[admin/riders/suspend] error');
  }
}
