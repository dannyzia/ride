// POST /api/admin/dispatch-toggle
// F15-API-03. Hot toggle to pause or resume dispatch without restart.
import { db } from '@/src/db';
import { systemConfig } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  paused: z.boolean(),
});

async function readDispatchPaused(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, 'dispatch_paused'))
    .limit(1);
  if (!row) return false;
  return row.value === 'true';
}

async function setDispatchPaused(paused: boolean): Promise<void> {
  const value = paused ? 'true' : 'false';
  const [existing] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, 'dispatch_paused'))
    .limit(1);
  if (existing) {
    await db
      .update(systemConfig)
      .set({ value, updated_at: new Date() })
      .where(eq(systemConfig.key, 'dispatch_paused'));
  } else {
    await db.insert(systemConfig).values({ key: 'dispatch_paused', value });
  }
}

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    return Response.json({ dispatch_paused: await readDispatchPaused() });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/dispatch-toggle] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);
    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;

    await setDispatchPaused(result.data.paused);

    logger.info('[admin/dispatch-toggle] toggled', {
      paused: result.data.paused,
      adminId: admin.id,
    });

    return Response.json({ dispatch_paused: result.data.paused });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/dispatch-toggle] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
