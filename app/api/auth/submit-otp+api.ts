// [public] Manual OTP fallback — validates OTP and returns firebase_custom_token
// In production, this calls the checkAuth Cloud Function with the manual OTP code

import { logger } from '@/lib/logger';
import { z } from 'zod';

const submitSchema = z.object({
  sessionCode: z.string().min(1),
  otp: z.string().min(4).max(8),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { sessionCode, otp } = parsed.data;

    // In production, call Firebase Cloud Function with OTP:
    //   const fnUrl = `https://asia-south1-${projectId}.cloudfunctions.net/checkAuth`;
    //   const fnRes = await fetch(fnUrl, { method:'POST', body: JSON.stringify({ sessionCode, otp }) });

    const fnUrl = process.env.CHECK_AUTH_FUNCTION_URL;
    if (fnUrl) {
      const fnRes = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ sessionCode, otp }),
      });
      const data = await fnRes.json();
      return Response.json(data, { status: fnRes.status });
    }

    // Dev fallback
    return Response.json({ error: 'no_function_configured' }, { status: 501 });

  } catch (err: any) {
    logger.error('[auth/submit-otp] error', err);
    return Response.json({ error: 'submit_failed' }, { status: 500 });
  }
}
