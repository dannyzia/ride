import crypto from 'crypto';
import { verifyFirebaseIdToken } from '../../../lib/auth';
import { signChallenge } from '../../../lib/jwt';

export async function POST(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);
    const phone = decoded.firebase?.phone || decoded.phone_number;
    if (!phone) return Response.json({ error: 'no_phone_in_token' }, { status: 400 });

    const challenge_jwt = signChallenge({
      firebase_uid: decoded.uid,
      phone: phone,
      jti: crypto.randomUUID(),
    });

    return Response.json({ challenge_jwt });
  } catch (e: any) {
    return Response.json({ error: 'unauthorized' }, { status: e.status ?? 401 });
  }
}
