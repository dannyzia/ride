// Auth: verifySupabaseToken via requireRole
import { db } from '../../../../src/db';
import { documents, drivers } from '../../../../src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireRole } from '../../../../lib/auth';
import { logger } from '../../../../lib/logger';
import { parseJsonBody } from '../../../../lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  documentId: z.string().uuid(),
});

const REQUIRED_DOC_TYPES = [
  'license_front', 'license_back',
  'reg_scan_front', 'reg_scan_back',
  'fitness_scan', 'tax_token_scan',
  'brta_certificate',
] as const;

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;

    const { documentId } = result.data;

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) return Response.json({ error: 'document_not_found' }, { status: 404 });

    // BRTA: check vehicle age for warning
    let vehicleAgeDays: number | null = null;
    const [driverInfo] = await db.select({
      vehicle_registration_date: drivers.vehicle_registration_date,
    }).from(drivers).where(eq(drivers.id, doc.driver_id)).limit(1);

    if (driverInfo?.vehicle_registration_date) {
      const regDate = new Date(driverInfo.vehicle_registration_date);
      const now = new Date();
      vehicleAgeDays = Math.floor((now.getTime() - regDate.getTime()) / 86400000);
    }

    let driverActivated = false;

    await db.transaction(async (tx) => {
      await tx.update(documents)
        .set({ status: 'approved', reviewed_by: admin.id, reviewed_at: new Date(), updated_at: new Date() })
        .where(eq(documents.id, documentId));

      // Check if all required docs are now approved for this driver
      if ((REQUIRED_DOC_TYPES as readonly string[]).includes(doc.doc_type)) {
        const approvedDocs = await tx.select({ doc_type: documents.doc_type })
          .from(documents)
          .where(and(
            eq(documents.driver_id, doc.driver_id),
            eq(documents.status, 'approved'),
            inArray(documents.doc_type, REQUIRED_DOC_TYPES as any),
          ));
        const approvedTypes = new Set(approvedDocs.map(d => d.doc_type));
        const allRequired = REQUIRED_DOC_TYPES.every(t => approvedTypes.has(t));

        if (allRequired) {
          await tx.update(drivers)
            .set({ status: 'active', updated_at: new Date() })
            .where(eq(drivers.id, doc.driver_id));
          driverActivated = true;
        }
      }
    });

    return Response.json({
      success: true,
      driver_activated: driverActivated,
      vehicle_age_days: vehicleAgeDays,
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/documents/approve] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
