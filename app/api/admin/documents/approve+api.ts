// Auth: verifySupabaseToken via requireRole
import { db } from '../../../../src/db';
import { documents, drivers } from '../../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/auth';
import { logger } from '../../../../lib/logger';
import { parseJsonBody } from '../../../../lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  documentId: z.string().uuid(),
});

// Owner decision D-2: driver activation is ALWAYS a manual admin action.
// Approving a document only sets its status — no automatic activation.

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;

    const { documentId } = result.data;

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) return Response.json({ error: 'document_not_found', message: 'Document not found' }, { status: 404 });

    // BRTA: check vehicle age for warning (informational only, independent of activation)
    let vehicleAgeDays: number | null = null;
    const [driverInfo] = await db.select({
      vehicle_registration_date: drivers.vehicle_registration_date,
    }).from(drivers).where(eq(drivers.id, doc.driver_id)).limit(1);

    if (driverInfo?.vehicle_registration_date) {
      const regDate = new Date(driverInfo.vehicle_registration_date);
      const now = new Date();
      vehicleAgeDays = Math.floor((now.getTime() - regDate.getTime()) / 86400000);
    }

    await db.update(documents)
      .set({ status: 'approved', reviewed_by: admin.id, reviewed_at: new Date(), updated_at: new Date() })
      .where(eq(documents.id, documentId));

    return Response.json({
      success: true,
      vehicle_age_days: vehicleAgeDays,
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/documents/approve] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
