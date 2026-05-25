import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

const JWT_SECRET = () => functions.config().hmac?.secret as string;

export const checkAuth = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const { sessionCode } = req.body as { sessionCode: string };

  const ref = admin.database().ref(`verification_requests/${sessionCode}`);
  const snap = await ref.once('value');
  if (!snap.exists()) { res.json({ status: 'expired' }); return; }

  const data = snap.val() as { phone: string; createdAt: number; initiator_uid: string; receipt?: { sender: string; sender_uid: string } };

  if (Date.now() - data.createdAt > 60_000) { res.json({ status: 'expired' }); return; }
  if (!data.receipt) { res.json({ status: 'pending' }); return; }

  if (data.receipt.sender_uid !== data.initiator_uid) {
    res.json({ status: 'mismatch' }); return;
  }
  if (data.receipt.sender !== data.phone) {
    res.json({ status: 'mismatch' }); return;
  }

  await ref.remove();

  const auth_uid = 'phone:' + crypto.createHash('sha256').update(data.phone).digest('hex').slice(0,32);
  const firebase_custom_token = await admin.auth().createCustomToken(auth_uid);
  const challenge_jwt = jwt.sign(
    { auth_uid, phone: data.phone, jti: crypto.randomUUID() },
    JWT_SECRET(), { algorithm: 'HS256', expiresIn: '5m' }
  );

  res.json({ status: 'received', challenge_jwt, firebase_custom_token });
});
