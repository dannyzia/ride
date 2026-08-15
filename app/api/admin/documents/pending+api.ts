// Auth: verifySupabaseToken via requireRole
import { db } from '../../../../src/db';
import { documents, users, drivers } from '../../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/auth';
import { logger } from '../../../../lib/logger';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);

    const pendingDocs = await db.select({
      id: documents.id,
      driver_id: documents.driver_id,
      driver_name: users.name,
      document_type: documents.doc_type,
      image_url: documents.storage_url,
      status: documents.status,
      created_at: documents.created_at,
    })
      .from(documents)
      .innerJoin(drivers, eq(documents.driver_id, drivers.id))
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(documents.status, 'pending'))
      .orderBy(documents.created_at);

    return Response.json(pendingDocs);
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/documents/pending] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
