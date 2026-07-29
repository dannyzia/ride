import { evaluateCancellation } from '@/lib/cancellation';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid' }, { status: 400 });

    await verifySupabaseToken(request);
    const { feeBdt, reason } = await evaluateCancellation(id, 'rider');
    return Response.json({ fee_bdt: feeBdt, reason });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[cancel-preview] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
