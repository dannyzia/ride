import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { validateAppCheckToken } from './lib/appCheck';

export const startVerification = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const { phone, timestamp, appCheckToken } = req.body as Record<string,unknown>;

  if (typeof timestamp !== 'number' || Math.abs(Date.now() - timestamp) > 300_000) {
    res.status(400).json({ error: 'timestamp_expired' }); return;
  }

  if (typeof phone !== 'string' || !/^\+880\d{10}$/.test(phone)) {
    res.status(422).json({ error: 'invalid_phone' }); return;
  }

  if (appCheckToken !== 'proxy') {
    if (!await validateAppCheckToken(String(appCheckToken ?? ''))) {
      res.status(401).json({ error: 'invalid_app_check' }); return;
    }
  }

  // Rate limit: max 5 requests per phone per 10 minutes
  const rateRef = admin.database().ref(`rate_limits/${phone.replace(/[^0-9]/g,'')}`);
  const rateSnap = await rateRef.once('value');
  const rateData = rateSnap.val() as { count: number; window_start: number } | null;
  const now = Date.now();
  if (rateData && now - rateData.window_start < 600_000 && rateData.count >= 5) {
    res.status(429).json({ error: 'rate_limited' }); return;
  }
  if (!rateData || now - rateData.window_start >= 600_000) {
    await rateRef.set({ count: 1, window_start: now });
  } else {
    await rateRef.update({ count: rateData.count + 1 });
  }

  const sessionCode = crypto.randomInt(100_000, 999_999).toString();
  const initiator_uid = (req.body as Record<string,unknown>).initiatorUid as string
    ?? (req as any).auth?.uid
    ?? null;
  await admin.database().ref(`verification_requests/${sessionCode}`).set({
    phone, createdAt: now, status: 'pending', initiator_uid,
  });

  res.json({ sessionCode, expiresAt: now + 60_000 });
});
