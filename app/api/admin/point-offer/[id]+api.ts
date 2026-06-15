// GET / PATCH /api/admin/point-offer/:id — single-resource endpoint
// F15-API-07.
import { db } from '@/src/db';
import { pointOffers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

const patchSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  points_required: z.number().int().positive().optional(),
  reward_type: z.enum(['package_grant', 'wallet_credit']).optional(),
  reward_value: z.string().min(1).max(100).optional(),
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
      .from(pointOffers)
      .where(eq(pointOffers.id, params.id))
      .limit(1);
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ offer: row });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/point-offer/:id] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);
    const result = await parseJsonBody(request, patchSchema);
    if (!result.ok) return result.response;

    const updates: Record<string, unknown> = { updated_at: new Date() };
    for (const [k, v] of Object.entries(result.data)) {
      if (v !== undefined) updates[k] = v;
    }

    const [updated] = await db
      .update(pointOffers)
      .set(updates)
      .where(eq(pointOffers.id, params.id))
      .returning();
    if (!updated) return Response.json({ error: 'not_found' }, { status: 404 });

    logger.info('[admin/point-offer/:id] updated', {
      offerId: params.id,
      adminId: admin.id,
    });

    return Response.json({ offer: updated });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/point-offer/:id] PATCH error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
