// GET / POST /api/admin/referral-campaigns — collection endpoint
// F15-API-06. Admin CRUD for referral campaigns. Single-active-at-a-time rule.
import { db } from '@/src/db';
import { referralCampaigns } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  referrer_reward_percent: z.number().int().min(1).max(100),
  referee_reward_percent: z.number().int().min(1).max(100),
  max_uses_per_referrer: z.number().int().positive(),
  max_uses_per_campaign: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const rows = await db
      .select()
      .from(referralCampaigns)
      .orderBy(desc(referralCampaigns.created_at));
    return Response.json({ campaigns: rows });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/referral-campaigns] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'validation_error', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [created] = await db.transaction(async (tx) => {
      if (parsed.data.is_active) {
        // Deactivate all others
        await tx
          .update(referralCampaigns)
          .set({ is_active: false, updated_at: new Date() })
          .where(eq(referralCampaigns.is_active, true));
      }
      const [row] = await tx
        .insert(referralCampaigns)
        .values({
          name: parsed.data.name,
          referrer_reward_percent: parsed.data.referrer_reward_percent,
          referee_reward_percent: parsed.data.referee_reward_percent,
          max_uses_per_referrer: parsed.data.max_uses_per_referrer,
          max_uses_per_campaign: parsed.data.max_uses_per_campaign ?? null,
          is_active: parsed.data.is_active,
        })
        .returning();
      return [row];
    });

    logger.info('[admin/referral-campaigns] created', {
      campaignId: created.id,
      name: created.name,
      adminId: admin.id,
    });

    return Response.json({ campaign: created }, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/referral-campaigns] POST error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
