import { db } from '@/src/db';
import { drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

const consentSchema = z.object({
  accepted: z.literal(true),
  version: z.string().min(1).max(20),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, consentSchema);
    if (!parsed.ok) return parsed.response;

    await db.update(drivers).set({
      consent_accepted: true,
      consent_version: parsed.data.version,
      consent_accepted_at: new Date(),
      updated_at: new Date(),
    }).where(eq(drivers.id, driver.id));

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/consent] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
