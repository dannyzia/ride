import { db } from '@/src/db';
import { taxRates } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const updateSchema = z.object({
  id: z.string().uuid(),
  rate_percent: z.string().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const rows = await db.select().from(taxRates);
    return Response.json({ rates: rows });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[admin/tax/config] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, ...data } = parsed.data;
    const updateData: Record<string, any> = {};
    if (data.rate_percent !== undefined) updateData.rate_percent = data.rate_percent.toString();
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    updateData.updated_at = new Date();
    await db.update(taxRates).set(updateData).where(eq(taxRates.id, id));
    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[admin/tax/config] POST error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
