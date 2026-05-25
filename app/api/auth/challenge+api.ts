import { verifyFirebaseIdToken } from '../../../lib/auth';
import Constants from 'expo-constants';

const CF_URL = process.env.START_VERIFICATION_FUNCTION_URL;

export async function POST(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);
    const body = await request.json();
    const { phone } = body;

    if (!phone || typeof phone !== 'string') {
      return Response.json({ error: 'invalid_body' }, { status: 400 });
    }

    if (!CF_URL) {
      return Response.json({ error: 'function_not_configured' }, { status: 501 });
    }

    const cfRes = await fetch(CF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        phone,
        timestamp: Date.now(),
        appCheckToken: 'proxy',
        initiatorUid: decoded.uid,
      }),
    });

    const data = await cfRes.json();
    return Response.json(data, { status: cfRes.status });
  } catch (e: any) {
    return Response.json({ error: 'unauthorized' }, { status: e.status ?? 401 });
  }
}
