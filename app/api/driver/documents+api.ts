import { db } from '@/src/db';
import { documents, documentTypeEnum, drivers, users } from '@/src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const rows = await db.select()
      .from(documents)
      .where(and(eq(documents.driver_id, driver.id), isNull(documents.deleted_at)))
      .orderBy(documents.created_at);

    return Response.json({ documents: rows }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/documents] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

// Allowed doc_type keys = the full document_type enum (pass-through, no aliasing).
const ALLOWED_DOC_TYPES = new Set<string>(documentTypeEnum.enumValues);

const docSchema = z.object({
  documents: z.record(z.string(), z.string().url()),
  vehicle_id: z.string().uuid().optional(),
  consent_accepted: z.boolean().optional(),
  consent_version: z.string().optional(),
  expiry_date: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id, status: drivers.status }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, docSchema);
    if (!parsed.ok) return parsed.response;

    const { documents: docMap, vehicle_id, consent_accepted, consent_version } = parsed.data;

    const invalidKeys = Object.keys(docMap).filter((key) => !ALLOWED_DOC_TYPES.has(key));
    if (invalidKeys.length > 0) {
      return Response.json(
        { error: 'invalid_doc_type', message: `Unsupported document type(s): ${invalidKeys.join(', ')}` },
        { status: 400 },
      );
    }

    const insertValues = Object.entries(docMap).map(([docType, storageUrl]) => ({
      driver_id: driver.id,
      doc_type: docType as any,
      storage_url: storageUrl,
      vehicle_id: vehicle_id ?? null,
      status: 'pending' as const,
      // TODO: accept optional per-doc file_size_bytes instead of hardcoding 0
      file_size_bytes: 0,
    }));

    await db.insert(documents).values(insertValues);

    // Legacy rideshare platform screenshots flag the driver as a legacy operator
    const isLegacySubmission = Object.keys(docMap).some(
      (docType) => docType.endsWith('_screenshot') || docType === 'legacy_screenshot',
    );
    if (isLegacySubmission) {
      await db.update(drivers)
        .set({ is_legacy_operator: true, updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }

    // Update driver status to pending if not already
    if (driver.status === 'temporary') {
      await db.update(drivers)
        .set({ status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }

    // Persist consent acceptance
    if (consent_accepted) {
      await db.update(drivers)
        .set({
          consent_accepted: true,
          consent_version: consent_version ?? 'v1',
          consent_accepted_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(drivers.id, driver.id));
    }

    return Response.json({ success: true, count: insertValues.length }, { status: 201 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/documents] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
