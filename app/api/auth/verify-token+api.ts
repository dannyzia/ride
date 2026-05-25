import { verifyFirebaseIdToken } from '../../../lib/auth';
import { db } from '../../../src/db';
import { users } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);
    const [user] = await db.select().from(users).where(eq(users.auth_uid, decoded.uid)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'Register first via /api/register' }, { status: 404 });
    return Response.json({ user_id: user.id, role: user.role, phone: user.phone });
  } catch (e: any) {
    return Response.json({ error: 'unauthorized' }, { status: e.status ?? 401 });
  }
}
