// Auth: verifySupabaseToken via requireRole
import { db } from '@/src/db';
import { pricing } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const updateSchema = z.object({
  id:                           z.string().uuid(),
  base_fare_bdt:                z.number().int().nonnegative().optional(),
  per_km_bdt:                   z.number().int().nonnegative().optional(),
  per_min_wait_bdt:             z.number().int().nonnegative().optional(),
  free_wait_minutes:            z.number().int().nonnegative().optional(),
  platform_commission_percent:  z.number().int().min(0).max(100).optional().nullable(),
  minimum_fare_bdt:             z.number().int().nonnegative().optional(),
  brta_fare_ceiling_bdt:        z.number().int().nonnegative().optional().nullable(),
  is_active:                    z.boolean().optional(),
});

export async function GET() {
  try {
    await requireRole('admin')(new Request('http://placeholder'));
    const all = await db.select()
      .from(pricing)
      .orderBy(desc(pricing.updated_at));
    return Response.json({ pricing: all });
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: 'unauthorized' }, { status: err.status });
    }
    logger.error('[admin/pricing] list error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole('admin')(request);
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { id, ...updates } = parsed.data;
    const [row] = await db.update(pricing)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(pricing.id, id))
      .returning();

    if (!row) return Response.json({ error: 'pricing_not_found' }, { status: 404 });
    return Response.json({ pricing: row });

  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: 'unauthorized' }, { status: err.status });
    }
    logger.error('[admin/pricing] update error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
