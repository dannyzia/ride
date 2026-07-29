import { db } from '@/src/db';
import { users, userDevices } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const deviceSchema = z.object({
  push_token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
  device_id: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!appUser) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const parsed = await parseJsonBody(request, deviceSchema);
    if (!parsed.ok) return parsed.response;

    const { push_token, platform, device_id } = parsed.data;

    const existing = await db
      .select({ id: userDevices.id })
      .from(userDevices)
      .where(and(eq(userDevices.user_id, appUser.id), eq(userDevices.device_id, device_id)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(userDevices)
        .set({ push_token, platform, last_active_at: new Date(), updated_at: new Date() })
        .where(eq(userDevices.id, existing[0].id));
    } else {
      await db.insert(userDevices).values({
        user_id: appUser.id, push_token, platform, device_id, last_active_at: new Date(),
      });
    }

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[user/device] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
