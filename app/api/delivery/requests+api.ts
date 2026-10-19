/**
 * POST /api/delivery/requests — RETIRED DORMANT STUB (B5-1, plan 27 §6.1).
 * The courier-bidding parcel entry is gone: P2P originates via the
 * `deliveries` universal-legs path (§6.1 — same flow, originated by any
 * role), exactly like shop order legs (lib/shopDeliveryBridge.ts).
 * `delivery_requests` takes no new writers; the table is retired.
 * GET  /api/delivery/requests — list own delivery requests (read-only,
 * retained for history visibility).
 */
import { verifySupabaseToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { db } from '@/src/db';
import { deliveryRequests } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function POST(_request: Request) {
  logger.warn('[delivery/requests] Retired parcel-bidding create received — use the §6.1 P2P deliveries flow instead');
  return Response.json(
    { error: 'delivery_bidding_retired', message: 'Courier-bid delivery requests are retired; create a P2P delivery via the §6.1 deliveries flow instead' },
    { status: 410 },
  );
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: 'user_not_found' }, { status: 403 });
    }

    const requests = await db
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.created_by_user_id, dbUser.id))
      .orderBy(desc(deliveryRequests.created_at))
      .limit(50);

    return Response.json({ deliveries: requests });
  } catch (error: unknown) {
    logger.error('Failed to list delivery requests', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
