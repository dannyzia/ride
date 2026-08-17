import { db } from '@/src/db';
import { riderIntroConfigs, zones } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const configSchema = z.object({
  zone_id: z.string().uuid(),
  is_active: z.boolean().optional(),
  ride_number: z.number().int().positive(),
  discount_percent: z.number().int().min(1).max(100),
  max_discount_bdt: z.number().int().positive().optional().nullable(),
  daily_cap_bdt: z.number().int().nonnegative(),
  effective_from: z.string().datetime().optional(),
  effective_to: z.string().datetime().optional().nullable(),
});

const updateSchema = configSchema.partial().extend({
  id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const configs = await db
      .select()
      .from(riderIntroConfigs)
      .leftJoin(zones, eq(riderIntroConfigs.zone_id, zones.id))
      .orderBy(desc(riderIntroConfigs.created_at));
    const result = configs.map((row) => ({
      id: row.rider_intro_configs.id,
      zone_id: row.rider_intro_configs.zone_id,
      zone_name: row.zones?.name ?? null,
      is_active: row.rider_intro_configs.is_active,
      ride_number: row.rider_intro_configs.ride_number,
      discount_percent: row.rider_intro_configs.discount_percent,
      max_discount_bdt: row.rider_intro_configs.max_discount_bdt,
      daily_cap_bdt: row.rider_intro_configs.daily_cap_bdt,
      effective_from: row.rider_intro_configs.effective_from,
      effective_to: row.rider_intro_configs.effective_to,
      created_at: row.rider_intro_configs.created_at,
      updated_at: row.rider_intro_configs.updated_at,
    }));
    return Response.json({ configs: result });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/rider-intro-configs] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, configSchema);
    if (!parsed.ok) return parsed.response;
    const [config] = await db
      .insert(riderIntroConfigs)
      .values({
        ...parsed.data,
        max_discount_bdt: parsed.data.max_discount_bdt ?? null,
        effective_from: parsed.data.effective_from ? new Date(parsed.data.effective_from) : undefined,
        effective_to: parsed.data.effective_to ? new Date(parsed.data.effective_to) : null,
      })
      .returning();
    return Response.json({ config }, { status: 201 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/rider-intro-configs] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, ...data } = parsed.data;
    const [config] = await db
      .update(riderIntroConfigs)
      .set({
        ...data,
        max_discount_bdt: data.max_discount_bdt ?? null,
        effective_from: data.effective_from ? new Date(data.effective_from) : undefined,
        effective_to: data.effective_to ? new Date(data.effective_to) : null,
        updated_at: new Date(),
      })
      .where(eq(riderIntroConfigs.id, id))
      .returning();
    if (!config)
      return Response.json({ error: 'config_not_found', message: 'Configuration not found' }, { status: 404 });
    return Response.json({ config });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/rider-intro-configs] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole('admin')(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id_required', message: 'ID parameter required' }, { status: 400 });
    await db
      .update(riderIntroConfigs)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(riderIntroConfigs.id, id));
    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/rider-intro-configs] DELETE error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
