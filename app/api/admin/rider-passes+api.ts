import { db } from '@/src/db';
import { riderPasses } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const passSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  price_bdt: z.number().int().positive(),
  discount_percent: z.number().int().min(0).max(100),
  max_rides: z.number().int().positive().optional(),
  validity_days: z.number().int().positive(),
  is_active: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  price_bdt: z.number().int().positive().optional(),
  discount_percent: z.number().int().min(0).max(100).optional(),
  max_rides: z.number().int().positive().optional(),
  validity_days: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const rows = await db.select().from(riderPasses).orderBy(desc(riderPasses.created_at));
    return Response.json({ passes: rows });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/rider-passes] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, passSchema);
    if (!parsed.ok) return parsed.response;
    const [pass] = await db.insert(riderPasses).values(parsed.data).returning();
    return Response.json({ pass });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/rider-passes] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, ...data } = parsed.data;
    await db.update(riderPasses).set({ ...data, updated_at: new Date() }).where(eq(riderPasses.id, id));
    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/rider-passes] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole('admin')(request);
    const { searchParams } = new URL(request.url);
const id = searchParams.get('id');
     if (!id) return Response.json({ error: 'id_required', message: 'ID parameter required' }, { status: 400 });
     const uuidParam = z.string().uuid().safeParse(id);
     if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });
     await db.update(riderPasses).set({ is_active: false, updated_at: new Date() }).where(eq(riderPasses.id, id));
    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/rider-passes] DELETE error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
