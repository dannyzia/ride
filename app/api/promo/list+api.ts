import { db } from '@/src/db';
import { promoCodes, promoRedemptions, users } from '@/src/db/schema';
import { eq, and, lte, gte, sql, count } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const listSchema = z.object({
  category: z.string().optional().default('all'),
});

/**
 * GET /api/promo/list
 * Auth: Required (rider)
 * Returns active, non-expired promos that the rider hasn't maxed out.
 */
export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const url = new URL(request.url);
    const _parsed = listSchema.safeParse({ category: url.searchParams.get('category') ?? 'all' });
    void _parsed; // category filtering reserved for future use

    const now = new Date();

    // Get rider DB id
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    // Fetch active, currently-valid promos
    const promos = await db.select().from(promoCodes).where(and(
      eq(promoCodes.is_active, true),
      lte(promoCodes.valid_from, now),
      gte(promoCodes.expires_at, now),
      sql`promo_codes.deleted_at IS NULL`,
    ));

    const result = await Promise.all(promos.map(async (promo) => {
      // Check per-rider usage
      const [{ riderUses }] = await db.select({ riderUses: count() })
        .from(promoRedemptions)
        .where(and(
          eq(promoRedemptions.promo_code_id, promo.id),
          eq(promoRedemptions.rider_id, user.id),
        ));
      const riderUseCount = riderUses;
      const perRiderMax = promo.max_uses_per_rider ?? 1;
      const riderMaxed = riderUseCount >= perRiderMax;

      // Check global usage
      const [{ globalUses }] = await db.select({ globalUses: count() })
        .from(promoRedemptions)
        .where(eq(promoRedemptions.promo_code_id, promo.id));
      const globalUseCount = globalUses;
      const globalMaxed = promo.max_uses != null && globalUseCount >= promo.max_uses;

      return {
        promo_id: promo.id,
        code: promo.code,
        title: promo.title ?? promo.code,
        category: 'discount' as const,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        max_discount_bdt: promo.max_discount_bdt,
        min_spend_bdt: promo.min_spend_bdt,
        valid_from: promo.valid_from.toISOString(),
        valid_to: promo.expires_at.toISOString(),
        terms: [] as string[],
        is_eligible: !riderMaxed && !globalMaxed,
        ineligible_reason: riderMaxed ? 'max_uses_per_rider' : globalMaxed ? 'max_uses_global' : null,
      };
    }));

    return Response.json({ promos: result });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[promo/list] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
