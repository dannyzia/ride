import { db } from '@/src/db';
import { supportTickets, ticketReplies } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const replySchema = z.object({
  message: z.string().min(1).max(5000),
  is_internal: z.boolean().optional().default(false),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid' }, { status: 400 });

    const { dbUser } = await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, replySchema);
    if (!parsed.ok) return parsed.response;

    const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!ticket) return Response.json({ error: 'ticket_not_found' }, { status: 404 });

    await db.insert(ticketReplies).values({
      ticket_id: id,
      author_id: dbUser.id,
      message: parsed.data.message,
      is_internal: parsed.data.is_internal,
    });

    await db.update(supportTickets)
      .set({ status: 'in_progress', updated_at: new Date() })
      .where(eq(supportTickets.id, id));

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[admin/tickets/reply] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
