/**
 * GET /api/delivery/requests/[id] — delivery request detail for the owner.
 *
 * Implements the endpoint request-detail.tsx already calls (the screen rendered
 * "Request not found" because only accept-bid existed under [id]).
 * Read-only: returns the delivery row plus any bids for it. Ownership is
 * enforced — only the request creator may fetch it.
 */
import { verifySupabaseToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { db } from '@/src/db';
import { deliveryRequests, deliveryBids } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const idSchema = z.string().uuid();

export async function GET(request: Request, { id }: { id: string }) {
  try {
    if (!idSchema.safeParse(id).success) {
      return Response.json({ error: 'invalid_uuid' }, { status: 400 });
    }

    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: 'user_not_found' }, { status: 403 });
    }

    const [delivery] = await db
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.id, id))
      .limit(1);

    if (!delivery || delivery.created_by_user_id !== dbUser.id) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const bids = await db
      .select()
      .from(deliveryBids)
      .where(eq(deliveryBids.request_id, id))
      .orderBy(desc(deliveryBids.submitted_at));

    return Response.json({ delivery, bids });
  } catch (err: unknown) {
    if (err instanceof Error && 'status' in err && (err as { status: number }).status === 401) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error('[delivery/requests/[id]] GET error', err);
    return Response.json(
      { error: 'server_error', message: 'Could not fetch delivery request' },
      { status: 500 },
    );
  }
}
