/**
 * POST /api/user/roles/resubmit — R6 re-submission.
 *
 * After an admin REJECTS a role (shop / fleet / delivery-man), the applicant
 * fixes the record and sends it back into the queue with this call. Scoped to
 * the caller's OWN record and only from 'rejected', so a live role can never
 * be pulled back into review, and a pending one is never re-queued.
 *
 * Auth: verifySupabaseToken (account-scoped, any role).
 */
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';
import { resubmit } from '@/lib/roleVerification';

const bodySchema = z.object({
  kind: z.enum(['shop', 'fleet', 'delivery_man']),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: 'user_not_found', message: 'No account for this login' }, { status: 404 });
    }

    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.ok) return parsed.response;

    const result = await resubmit(dbUser.id, parsed.data.kind);
    logger.info('[user/roles] resubmitted', { user_id: dbUser.id, kind: parsed.data.kind });

    return Response.json({ kind: parsed.data.kind, verification_status: result.status });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Not authorized' }, { status: 403 });
    if (status === 404)
      return Response.json({ error: 'user_not_found', message: 'No account for this login' }, { status: 404 });
    if (status === 409)
      return Response.json(
        { error: 'nothing_to_resubmit', message: 'No rejected record to resubmit' },
        { status: 409 },
      );
    logger.error('[user/roles/resubmit] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
