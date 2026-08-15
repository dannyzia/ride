// GET / POST /api/admin/point-offers — collection endpoint
// F15-API-07.
import { db } from '@/src/db';
import { pointOffers } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

const createSchema = z.object({
  title: z.string().min(1).max(100),
  points_required: z.number().int().positive(),
  reward_type: z.enum(['package_grant', 'wallet_credit']),
  reward_value: z.string().min(1).max(100),
  is_active: z.boolean().optional().default(true),
});

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const rows = includeInactive
      ? await db
          .select()
          .from(pointOffers)
          .orderBy(desc(pointOffers.created_at))
      : await db
          .select()
          .from(pointOffers)
          .where(eq(pointOffers.is_active, true))
          .orderBy(desc(pointOffers.created_at));
    return Response.json({ offers: rows });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/point-offers] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);
    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;

    const [created] = await db
      .insert(pointOffers)
      .values(result.data)
      .returning();

    logger.info('[admin/point-offers] created', {
      offerId: created.id,
      title: created.title,
      adminId: admin.id,
    });

    return Response.json({ offer: created }, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/point-offers] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
