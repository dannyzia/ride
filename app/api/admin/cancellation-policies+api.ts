import { db } from '@/src/db';
import { cancellationPolicies } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const policySchema = z.object({
  name: z.string().min(1).max(100),
  canceller_role: z.string().min(1),
  ride_status: z.string().min(1),
  time_threshold_seconds: z.number().int().nonnegative(),
  fee_type: z.string().min(1),
  fee_amount_bdt: z.number().int().nonnegative(),
  max_fee_bdt: z.number().int().nonnegative(),
  is_active: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
});

export async function GET() {
  try {
    const rows = await db.select().from(cancellationPolicies).orderBy(desc(cancellationPolicies.priority));
    return Response.json({ policies: rows });
  } catch (err: any) {
    logger.error('[admin/cancellation-policies] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, policySchema);
    if (!parsed.ok) return parsed.response;
    const [policy] = await db.insert(cancellationPolicies).values(parsed.data).returning();
    return Response.json({ policy });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/cancellation-policies] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
