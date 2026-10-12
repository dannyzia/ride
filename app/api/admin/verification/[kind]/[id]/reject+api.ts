/**
 * POST /api/admin/verification/[kind]/[id]/reject
 *
 * §7 + R6: reject a pending shop / fleet / delivery-man applicant WITH a
 * reason. The role never goes live (operational status untouched), the reason
 * is stored on the record and surfaces to the applicant in-app through
 * GET /api/user/roles, and R6 lets them RESUBMIT after fixing it. The decision
 * is written to audit_logs (§7 A3).
 *
 * Auth: requireAdminPermission('marketplace.write') — owner, admin only
 * (ops_manager/moderator are read-only on the new queues, §7 A2).
 */
import { z } from 'zod';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';
import { VERIFICATION_KINDS, reject } from '@/lib/roleVerification';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kindSchema = z.enum(VERIFICATION_KINDS);

// R6 + F-30: `reason` is the applicant-visible one-line summary (a real
// sentence); the STRUCTURED trio code/field/example pins down WHAT failed and
// what an acceptable document looks like; internal_note is admin-only and is
// never returned to the applicant (stripped in GET /api/user/roles).
const bodySchema = z.object({
  reason: z.string().min(5).max(500),
  code: z.string().min(2).max(40).regex(/^[a-z0-9_-]+$/, 'code must be a short slug').optional(),
  field: z.string().min(2).max(80).optional(),
  example: z.string().min(5).max(500).optional(),
  internal_note: z.string().max(500).optional(),
});

export async function POST(request: Request, { kind, id }: { kind: string; id: string }) {
  try {
    const { dbUser } = await requireAdminPermission('marketplace.write')(request);

    const parsedKind = kindSchema.safeParse(kind);
    if (!parsedKind.success) {
      return Response.json(
        { error: 'invalid_kind', message: `kind must be one of: ${VERIFICATION_KINDS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid record id' }, { status: 400 });
    }

    const parsedBody = await parseJsonBody(request, bodySchema);
    if (!parsedBody.ok) return parsedBody.response;

    const { reason, ...structured } = parsedBody.data;
    const rejected = await reject(parsedKind.data, id, dbUser.id, { reason, ...structured }, request);
    logger.info('[admin/verification] rejected', {
      kind: parsedKind.data,
      id,
      admin: dbUser.id,
    });

    return Response.json({
      ...rejected,
      kind: parsedKind.data,
      verification_status: 'rejected',
      reason,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 400)
      return Response.json({ error: 'invalid_request', message: errors.getErrorMessage(err) }, { status: 400 });
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    if (status === 404)
      return Response.json({ error: 'not_found', message: 'No pending record with that id' }, { status: 404 });
    if (status === 409)
      return Response.json(
        { error: 'already_decided', message: 'This record has already been decided' },
        { status: 409 },
      );
    logger.error('[admin/verification/reject] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
