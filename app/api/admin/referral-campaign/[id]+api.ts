// GET / PATCH /api/admin/referral-campaign/:id — single-resource endpoint
// F15-API-06.
import { db } from '@/src/db';
import { referralCampaigns } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  referrer_reward_percent: z.number().int().min(1).max(100).optional(),
  referee_reward_percent: z.number().int().min(1).max(100).optional(),
  max_uses_per_referrer: z.number().int().positive().optional(),
  max_uses_per_campaign: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

interface Params {
  params: { id: string };
}

export async function GET(request: Request, { params }: Params) {
  try {
    await requireRole('admin')(request);
    const [row] = await db
      .select()
      .from(referralCampaigns)
      .where(eq(referralCampaigns.id, params.id))
      .limit(1);
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ campaign: row });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/referral-campaign/:id] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);
    const result = await parseJsonBody(request, patchSchema);
    if (!result.ok) return result.response;

    const [existing] = await db
      .select()
      .from(referralCampaigns)
      .where(eq(referralCampaigns.id, params.id))
      .limit(1);
    if (!existing)
      return Response.json({ error: 'not_found' }, { status: 404 });

    await db.transaction(async (tx) => {
      if (result.data.is_active === true && !existing.is_active) {
        // Single-active rule: deactivate others
        await tx
          .update(referralCampaigns)
          .set({ is_active: false, updated_at: new Date() })
          .where(eq(referralCampaigns.is_active, true));
      }
      const updates: Record<string, unknown> = { updated_at: new Date() };
      for (const [k, v] of Object.entries(result.data)) {
        if (v !== undefined) updates[k] = v;
      }
      await tx
        .update(referralCampaigns)
        .set(updates)
        .where(eq(referralCampaigns.id, params.id));
    });

    const [updated] = await db
      .select()
      .from(referralCampaigns)
      .where(eq(referralCampaigns.id, params.id))
      .limit(1);

    logger.info('[admin/referral-campaign/:id] updated', {
      campaignId: params.id,
      adminId: admin.id,
    });

    return Response.json({ campaign: updated });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/referral-campaign/:id] PATCH error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
