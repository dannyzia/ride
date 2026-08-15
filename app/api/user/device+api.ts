import { db } from '@/src/db';
import { users, userDevices } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
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
    if (!appUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, deviceSchema);
    if (!parsed.ok) return parsed.response;

    const { push_token, platform, device_id } = parsed.data;

    // Y-3: atomic upsert — the user_devices_user_id_device_id_key unique index
    // makes the old check-then-insert/update a race (a double-tap would hit an
    // integrity error → 500). One statement, no window.
    await db
      .insert(userDevices)
      .values({
        user_id: appUser.id, push_token, platform, device_id, last_active_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [userDevices.user_id, userDevices.device_id],
        set: { push_token, platform, last_active_at: new Date(), updated_at: new Date() },
      });

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[user/device] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
