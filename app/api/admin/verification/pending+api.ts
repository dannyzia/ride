/**
 * GET /api/admin/verification/pending?kind=shop|fleet|delivery_man
 *
 * §7 verification queue — the driver-documents queue pattern applied to the
 * three verification-gated launch roles.
 *
 * Auth: requireAdminPermission('admin.read') — ops_manager and moderator are
 * READ-ONLY on the new queues (§7 A2); approve/reject live behind
 * 'marketplace.write' (owner, admin), which is also the permission the existing
 * marketplace admin surface enforces.
 */
import { z } from 'zod';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';
import { VERIFICATION_KINDS, listPending } from '@/lib/roleVerification';

const querySchema = z.object({
  kind: z.enum(VERIFICATION_KINDS),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('admin.read')(request);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ kind: url.searchParams.get('kind') });
    if (!parsed.success) {
      return Response.json(
        { error: 'invalid_kind', message: `kind must be one of: ${VERIFICATION_KINDS.join(', ')}` },
        { status: 400 },
      );
    }

    const pending = await listPending(parsed.data.kind);
    return Response.json({ kind: parsed.data.kind, pending, total: pending.length });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/verification/pending] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
