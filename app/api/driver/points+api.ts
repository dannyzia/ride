import { db } from '@/src/db';
import { points, pointTransactions, pointOffers, users } from '@/src/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [pointRow] = await db.select().from(points).where(eq(points.user_id, user.id)).limit(1);

    const history = await db
      .select()
      .from(pointTransactions)
      .where(eq(pointTransactions.user_id, user.id))
      .orderBy(desc(pointTransactions.created_at))
      .limit(50);

    const offers = await db
      .select()
      .from(pointOffers)
      .where(eq(pointOffers.is_active, true));

    return Response.json({
      balance: pointRow?.balance ?? 0,
      history,
      offers,
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/points] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

const redeemSchema = z.object({
  offer_id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, redeemSchema);
    if (!parsed.ok) return parsed.response;

    const [offer] = await db.select().from(pointOffers).where(and(eq(pointOffers.id, parsed.data.offer_id), eq(pointOffers.is_active, true))).limit(1);
    if (!offer) return Response.json({ error: 'offer_not_found', message: 'Offer not found' }, { status: 404 });

    const result = await db.transaction(async (tx) => {
      const [pointRow] = await tx.select().from(points).where(eq(points.user_id, user.id)).limit(1).for('update');
      if (!pointRow || pointRow.balance < offer.points_required) {
        return { ok: false as const, reason: 'insufficient_points' };
      }

      await tx.update(points)
        .set({ balance: sql`${points.balance} - ${offer.points_required}`, updated_at: new Date() })
        .where(eq(points.user_id, user.id));

      await tx.insert(pointTransactions).values({
        user_id: user.id,
        transaction_type: 'redeemed',
        amount: -offer.points_required,
        balance_after: pointRow.balance - offer.points_required,
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      return Response.json({ error: 'insufficient_points', message: 'Insufficient loyalty points' }, { status: 422 });
    }

    return Response.json({ success: true, points_used: offer.points_required });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/points] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
