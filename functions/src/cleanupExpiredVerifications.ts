import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const cleanupExpiredVerifications = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const cutoff = Date.now() - 3_600_000; // 1 hour ago
    const snap = await admin.database()
      .ref('verification_requests')
      .orderByChild('createdAt')
      .endAt(cutoff)
      .once('value');

    const updates: Record<string, null> = {};
    snap.forEach(child => { updates[child.key!] = null; return false; });
    if (Object.keys(updates).length > 0) {
      await admin.database().ref('verification_requests').update(updates);
    }
  });
