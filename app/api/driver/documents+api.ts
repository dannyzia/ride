import { db } from '@/src/db';
import { documents, drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const DOC_TYPE_MAP: Record<string, string> = {
  nid_front: 'license_front',
  nid_back: 'license_back',
  driving_license: 'brta_certificate',
  vehicle_registration: 'reg_scan_front',
};

const docSchema = z.object({
  documents: z.record(z.string(), z.string().url()),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id, status: drivers.status }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const body = await request.json();
    const parsed = docSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { documents: docMap } = parsed.data;

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

    return Response.json({ success: true, count: insertValues.length }, { status: 201 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/documents] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
