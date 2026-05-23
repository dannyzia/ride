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

  if (!await validateAppCheckToken(String(appCheckToken ?? ''))) {
    res.status(401).json({ error: 'invalid_app_check' }); return;
  }

  const sessionCode = crypto.randomInt(100_000, 999_999).toString();
  const initiator_uid = (req as any).auth?.uid ?? null;
  await admin.database().ref(`verification_requests/${sessionCode}`).set({
    phone, createdAt: Date.now(), status: 'pending', initiator_uid,
  });

  res.json({ sessionCode, expiresAt: Date.now() + 60_000 });
});
