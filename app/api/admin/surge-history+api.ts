import { db } from '@/src/db';
import { surgeHistory } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const rows = await db.select().from(surgeHistory).orderBy(desc(surgeHistory.triggered_at)).limit(50);
    return Response.json({ history: rows });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/surge-history] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
