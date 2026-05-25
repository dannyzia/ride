import { db } from '@/src/db';
import { drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const statusSchema = z.object({
  is_online: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, decoded.uid)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const body = await request.json();
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error' }, { status: 400 });
    }

    const { is_online } = parsed.data;

    await db.update(drivers)
      .set({ is_online, updated_at: new Date() })
      .where(eq(drivers.user_id, user.id));

    return Response.json({ success: true, is_online });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/status] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
