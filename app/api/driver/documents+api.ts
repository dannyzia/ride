import { db } from '@/src/db';
import { documents, documentTypeEnum, drivers, users, vehicles } from '@/src/db/schema';
import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import { isAllowedStorageUrl } from '@/lib/storageUrl';
import * as errors from '@/lib/errors';

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

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/documents] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

// Allowed doc_type keys = the full document_type enum (pass-through, no aliasing).
const ALLOWED_DOC_TYPES = new Set<string>(documentTypeEnum.enumValues);

const docSchema = z.object({
  // M-2: an empty map used to reach tx.insert(values([])) and 500. Require at
  // least one document UNLESS this call only persists consent (the wizard's
  // re-submit path may legitimately send consent with no docs — M-9).
  documents: z.record(z.string(), z.string().url()),
  vehicle_id: z.string().uuid().optional(),
  consent_accepted: z.boolean().optional(),
  consent_version: z.string().optional(),
  expiry_date: z.string().datetime().optional(),
}).refine(
  (data) => Object.keys(data.documents).length > 0 || data.consent_accepted === true,
  'Either a document or consent acceptance is required',
);

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id, status: drivers.status }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, docSchema);
    if (!parsed.ok) return parsed.response;

    const { documents: docMap, vehicle_id, consent_accepted, consent_version, expiry_date } = parsed.data;

    // M-1: a client-supplied vehicle_id must belong to THIS driver — otherwise
    // driver A could link photo rows to driver B's vehicle. Only check when a
    // vehicle_id is actually supplied (docs can be submitted before step 2).
    if (vehicle_id) {
      const [ownedVehicle] = await db.select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.id, vehicle_id), eq(vehicles.driver_id, driver.id)))
        .limit(1);
      if (!ownedVehicle) {
        return Response.json({ error: 'vehicle_not_found', message: 'Vehicle does not belong to this driver' }, { status: 400 });
      }
    }

    const invalidKeys = Object.keys(docMap).filter((key) => !ALLOWED_DOC_TYPES.has(key));
    if (invalidKeys.length > 0) {
      return Response.json(
        { error: 'invalid_doc_type', message: `Unsupported document type(s): ${invalidKeys.join(', ')}` },
        { status: 400 },
      );
    }

    // C3a: reject any storage_url that is not served by this project's own
    // Supabase storage. The admin trusts these URLs as verification evidence;
    // a bare z.string().url() accepts arbitrary external hosts.
    const spoofed = Object.entries(docMap).filter(
      ([, storageUrl]) => !isAllowedStorageUrl(storageUrl, 'driver-documents'),
    );
    if (spoofed.length > 0) {
      return Response.json(
        { error: 'invalid_storage_url', message: 'Document URLs must be uploaded to Ride storage' },
        { status: 400 },
      );
    }

    const insertValues = Object.entries(docMap).map(([docType, storageUrl]) => ({
      driver_id: driver.id,
      doc_type: docType as any,
      storage_url: storageUrl,
      vehicle_id: vehicle_id ?? null,
      status: 'pending' as const,
      expiry_date: expiry_date ? new Date(expiry_date) : null,
      // TODO: accept optional per-doc file_size_bytes instead of hardcoding 0
      file_size_bytes: 0,
    }));

    // The documents table has a partial unique index
    // documents_one_per_type (driver_id, doc_type) WHERE status IN
    // ('pending','approved') AND deleted_at IS NULL. A plain insert 500s on
    // resubmission (network retry, photo swap after posting). The server owns
    // this invariant: within one transaction, soft-delete any live row of the
    // submitted types (history preserved for the admin — rows stay readable
    // with deleted_at set), then insert the new pending rows.
    //
    // A per-driver advisory lock serializes CONCURRENT submissions too: under
    // READ COMMITTED, two parallel POSTs would otherwise both pass the
    // soft-delete (each missing the other's just-inserted row) and collide on
    // the unique index (N6).
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('driver_docs_' || ${driver.id}))`);
      const submittedTypes = Object.keys(docMap);
      if (submittedTypes.length > 0) {
        await tx.update(documents)
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where(and(
            eq(documents.driver_id, driver.id),
            inArray(documents.doc_type, submittedTypes as any),
            isNull(documents.deleted_at),
          ));
      }
      // M-2 defense-in-depth: never insert an empty values array (the schema
      // refine above already blocks pure-empty submissions).
      if (insertValues.length > 0) {
        await tx.insert(documents).values(insertValues);
      }
    });

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

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/documents] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
