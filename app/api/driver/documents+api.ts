import { db } from '@/src/db';
import { documents, drivers, users } from '@/src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const rows = await db.select()
      .from(documents)
      .where(and(eq(documents.driver_id, driver.id), isNull(documents.deleted_at)))
      .orderBy(documents.created_at);

    return Response.json({ documents: rows }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/documents] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

const DOC_TYPE_MAP: Record<string, string> = {
  nid_front: 'license_front',
  nid_back: 'license_back',
  driving_license: 'brta_certificate',
  vehicle_registration: 'reg_scan_front',
};

const docSchema = z.object({
  documents: z.record(z.string(), z.string().url()),
  consent_accepted: z.boolean().optional(),
  consent_version: z.string().optional(),
  expiry_date: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id, status: drivers.status }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const parsed = await parseJsonBody(request, docSchema);
    if (!parsed.ok) return parsed.response;

    const { documents: docMap, consent_accepted, consent_version } = parsed.data;

    const insertValues = Object.entries(docMap).map(([docType, storageUrl]) => ({
      driver_id: driver.id,
      doc_type: (DOC_TYPE_MAP[docType] ?? docType) as any,
      storage_url: storageUrl,
      status: 'pending' as const,
      file_size_bytes: 0,
    }));

    await db.insert(documents).values(insertValues);

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
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/documents] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
