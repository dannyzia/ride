import * as admin from 'firebase-admin';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { eq } from 'drizzle-orm';

let initialised = false;
function initFirebaseAdmin() {
  if (!initialised && !admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
    initialised = true;
  }
}

export async function verifyFirebaseIdToken(request: Request) {
  initFirebaseAdmin();
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw Object.assign(new Error('Missing token'), { status: 401 });
  try { return await admin.auth().verifyIdToken(token); }
  catch { throw Object.assign(new Error('Invalid token'), { status: 401 }); }
}

export function requireRole(role: 'rider' | 'driver' | 'admin') {
  return async (request: Request) => {
    const decoded = await verifyFirebaseIdToken(request);
    const [user] = await db.select().from(users).where(eq(users.auth_uid, decoded.uid)).limit(1);
    if (!user || user.role !== role)
      throw Object.assign(new Error('Insufficient role'), { status: 403 });
    return { decoded, user };
  };
}
