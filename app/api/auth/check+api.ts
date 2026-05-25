// [public] Proxies to Firebase Cloud Function checkAuth
// In dev, returns mock response for local testing

import { logger } from '@/lib/logger';
import { z } from 'zod';

const checkSchema = z.object({
  sessionCode: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = checkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error' }, { status: 400 });
    }

    const { sessionCode } = parsed.data;

    // In production, call Firebase Cloud Function:
    //   const fnUrl = `https://asia-south1-${projectId}.cloudfunctions.net/checkAuth`;
    //   const fnRes = await fetch(fnUrl, { method:'POST', body: JSON.stringify({ sessionCode }) });

    // For now, return placeholder — real implementation calls Firebase Cloud Function
    // which checks the used_challenges table and returns { status, firebase_custom_token }
    const fnUrl = process.env.CHECK_AUTH_FUNCTION_URL;
    if (fnUrl) {
      const fnRes = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ sessionCode }),
      });
      const data = await fnRes.json();
      return Response.json(data, { status: fnRes.status });
    }

    // Dev fallback: session not yet received
    return Response.json({ status: 'pending' });

  } catch (err: any) {
    logger.error('[auth/check] error', err);
    return Response.json({ error: 'check_failed' }, { status: 500 });
  }
}
