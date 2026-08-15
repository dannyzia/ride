// Auth: verifySupabaseToken via requireRole
import { db } from '../../../../src/db';
import { documents } from '../../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/auth';
import { logger } from '../../../../lib/logger';
import { parseJsonBody } from '../../../../lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  documentId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;

    const { documentId, reason } = result.data;

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) return Response.json({ error: 'document_not_found', message: 'Document not found' }, { status: 404 });

    await db.update(documents)
      .set({
        status: 'rejected',
        reviewed_by: admin.id,
        reviewed_at: new Date(),
        rejection_reason: reason,
        updated_at: new Date(),
      })
      .where(eq(documents.id, documentId));

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/documents/reject] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
