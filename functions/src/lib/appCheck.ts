import * as admin from 'firebase-admin';
export async function validateAppCheckToken(token: string): Promise<boolean> {
  try { await admin.appCheck().verifyToken(token); return true; }
  catch { return false; }
}
