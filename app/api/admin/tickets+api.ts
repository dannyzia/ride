import { db } from '@/src/db';
import { supportTickets, users } from '@/src/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const listSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().max(100).default(50),
  offset: z.coerce.number().default(0),
});

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const url = new URL(request.url);
    const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
    const { status, priority, category, limit, offset } = parsed.data ?? { limit: 50, offset: 0 };

    const conditions = [];
    if (status) conditions.push(eq(supportTickets.status, status));
    if (priority) conditions.push(eq(supportTickets.priority, priority));
    if (category) conditions.push(eq(supportTickets.category, category));

    const rows = await db
      .select({
        id: supportTickets.id,
        user_id: supportTickets.user_id,
        assigned_to: supportTickets.assigned_to,
        category: supportTickets.category,
        subject: supportTickets.subject,
        status: supportTickets.status,
        priority: supportTickets.priority,
        created_at: supportTickets.created_at,
        updated_at: supportTickets.updated_at,
        user_name: users.name,
        user_phone: users.phone,
      })
      .from(supportTickets)
      .leftJoin(users, eq(users.id, supportTickets.user_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(supportTickets.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(supportTickets)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return Response.json({ tickets: rows, total: Number(countResult?.count ?? 0) });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/tickets] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
