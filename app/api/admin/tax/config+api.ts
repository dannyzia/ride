import { adminErrorResponse } from '@/lib/adminRoute';
import { db } from '@/src/db';
import { taxRates } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const updateSchema = z.object({
  id: z.string().uuid(),
  // Human-entered percent, stored as text. Bounded and shape-checked here so a
  // half-typed or cleared field can never reach tax_rates.
  rate_percent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, 'rate_percent must be 0-100 with up to 2 decimals')
    .refine((v) => Number(v) >= 0 && Number(v) <= 100, 'rate_percent must be between 0 and 100')
    .optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('finance.write')(request);
    const rows = await db.select().from(taxRates);
    return Response.json({ rates: rows });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    return adminErrorResponse(err, '[admin/tax/config] GET error');
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPermission('finance.write')(request);
    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, ...data } = parsed.data;
    const updateData: Record<string, any> = {};
    if (data.rate_percent !== undefined) updateData.rate_percent = data.rate_percent.toString();
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    updateData.updated_at = new Date();
    await db.update(taxRates).set(updateData).where(eq(taxRates.id, id));
    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    return adminErrorResponse(err, '[admin/tax/config] POST error');
  }
}
