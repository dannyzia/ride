import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, drivers, lostItems } from '@/src/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const respondSchema = z.object({
  item_id: z.string().uuid(),
  action: z.enum(['confirm', 'photo', 'return_arranged', 'not_found']),
  driver_response: z.string().max(500).optional(),
  photo_url: z.string().optional(),
  return_method: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const items = await db.select().from(lostItems)
      .where(eq(lostItems.driver_id, driver.id))
      .orderBy(desc(lostItems.reported_at));

    return Response.json({ items });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/lost-items] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, respondSchema);
    if (!parsed.ok) return parsed.response;

    const [item] = await db.select().from(lostItems).where(and(eq(lostItems.id, parsed.data.item_id), eq(lostItems.driver_id, driver.id))).limit(1);
    if (!item) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });

    const statusMap: Record<string, string> = { confirm: 'driver_confirmed', photo: 'photo_provided', return_arranged: 'arranged_return', not_found: 'unresolved' };
    const update: Record<string, any> = { status: statusMap[parsed.data.action] ?? 'driver_confirmed', driver_response: parsed.data.driver_response, updated_at: new Date() };
    if (parsed.data.photo_url) update.driver_photo_url = parsed.data.photo_url;
    if (parsed.data.return_method) update.return_method = parsed.data.return_method;

    await db.update(lostItems).set(update).where(eq(lostItems.id, parsed.data.item_id));
    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/lost-items] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
