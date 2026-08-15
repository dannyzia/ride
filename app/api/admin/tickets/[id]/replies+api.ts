import { db } from '@/src/db';
import { ticketReplies, users } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    await requireRole('admin')(request);
    const rows = await db
      .select({
        id: ticketReplies.id,
        author_id: ticketReplies.author_id,
        is_internal: ticketReplies.is_internal,
        message: ticketReplies.message,
        created_at: ticketReplies.created_at,
        author_name: users.name,
      })
      .from(ticketReplies)
      .leftJoin(users, eq(users.id, ticketReplies.author_id))
      .where(eq(ticketReplies.ticket_id, id))
      .orderBy(desc(ticketReplies.created_at));
    return Response.json({ replies: rows });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/tickets/replies] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
