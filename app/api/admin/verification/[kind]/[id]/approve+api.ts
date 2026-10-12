/**
 * POST /api/admin/verification/[kind]/[id]/approve
 *
 * §7 + R6: approve a pending shop / fleet / delivery-man applicant. The role
 * goes live (shops 'active'+is_verified, fleets 'ACTIVE' + OWNER membership,
 * couriers 'active') and the decision is written to audit_logs (§7 A3).
 *
 * Auth: requireAdminPermission('marketplace.write') — owner, admin only
 * (ops_manager/moderator are read-only on the new queues, §7 A2).
 */
import { z } from 'zod';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';
import { VERIFICATION_KINDS, approve } from '@/lib/roleVerification';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kindSchema = z.enum(VERIFICATION_KINDS);

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

    const approved = await approve(parsedKind.data, id, dbUser.id, request);
    logger.info('[admin/verification] approved', { kind: parsedKind.data, id, admin: dbUser.id });

    return Response.json({ ...approved, kind: parsedKind.data, verification_status: 'approved' });
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
    logger.error('[admin/verification/approve] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
