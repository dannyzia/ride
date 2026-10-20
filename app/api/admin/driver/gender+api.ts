// POST /api/admin/driver/gender — S8 §4.6 driver gender correction route.
//
// Corrects drivers.gender (+ users.gender) with a mandatory audit rationale.
// gender_verified stamps ONLY for female + explicit confirmation + an already
// APPROVED NID document on file (else 422 nid_document_not_approved).
import { db } from '@/src/db';
import {
  drivers,
  users,
  documents,
  auditLogs,
} from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  driver_id: z.string().uuid(),
  gender: z.enum(['male', 'female', 'other']),
  // Explicit confirmation required — eliminates one-click verify bypass.
  gender_confirmed: z.boolean(),
  reason: z.string().min(5).max(500),
});

export async function POST(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission('verification.write')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { driver_id, gender, gender_confirmed, reason } = result.data;

    const [driver] = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        gender: drivers.gender,
        gender_verified: drivers.gender_verified,
      })
      .from(drivers)
      .where(eq(drivers.id, driver_id))
      .limit(1);
    if (!driver) {
      return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });
    }

    const wantsVerify = gender === 'female' && gender_confirmed === true;

    // NID gate BEFORE any write: an approved NID must already be on file.
    // (The approve route stamps documents itself, so it needs no such gate.)
    if (wantsVerify) {
      const [nidDoc] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.driver_id, driver_id),
            inArray(documents.doc_type, ['nid_front', 'nid_back']),
            eq(documents.status, 'approved'),
          ),
        )
        .limit(1);
      if (!nidDoc) {
        return Response.json(
          {
            error: 'nid_document_not_approved',
            message:
              'Cannot verify female gender without an approved NID document on file. Pending NID documents must be reviewed and approved via /api/admin/driver/approve before gender verification can be stamped.',
          },
          { status: 422 },
        );
      }
    }

    const oldGender = driver.gender;
    const oldVerified = driver.gender_verified;

    await db.transaction(async (tx) => {
      // Step 1: gender write (fires trg_drivers_gender_reset → flags false).
      await tx
        .update(drivers)
        .set({ gender, updated_at: new Date() })
        .where(eq(drivers.id, driver_id));
      // Step 2: verified stamp as a SEPARATE update (never combined with the
      // gender write — the trigger would clobber it).
      if (wantsVerify) {
        await tx
          .update(drivers)
          .set({ gender_verified: true, updated_at: new Date() })
          .where(eq(drivers.id, driver_id));
      }
      // Step 3: keep the users row in sync.
      await tx
        .update(users)
        .set({ gender, updated_at: new Date() })
        .where(eq(users.id, driver.user_id));
      // Step 4: structured audit entry in the same tx.
      await tx.insert(auditLogs).values({
        actor_user_id: dbUser.id,
        action: 'driver_gender_corrected',
        entity_type: 'driver',
        entity_id: driver_id,
        old_value: { gender: oldGender, gender_verified: oldVerified },
        new_value: { gender, gender_verified: wantsVerify, reason },
        ip_address: request.headers?.get?.('x-forwarded-for') ?? null,
        user_agent: request.headers?.get?.('user-agent') ?? null,
      });
    });

    logger.info('[admin/driver/gender] corrected', {
      driverId: driver_id,
      oldGender,
      newGender: gender,
      verified: wantsVerify,
      adminId: dbUser.id,
    });

    return Response.json(
      { driver_id, gender, gender_verified: wantsVerify },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/gender] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
