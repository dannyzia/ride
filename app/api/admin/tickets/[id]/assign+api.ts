import { db } from '@/src/db';
import { supportTickets } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const assignSchema = z.object({
  assigned_to: z.string().uuid(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid' }, { status: 400 });

    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, assignSchema);
    if (!parsed.ok) return parsed.response;

    await db.update(supportTickets)
      .set({ assigned_to: parsed.data.assigned_to, updated_at: new Date() })
      .where(eq(supportTickets.id, id));

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[admin/tickets/assign] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
