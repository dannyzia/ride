/**
 * POST /api/delivery/remittance/[id] — S6 F-33 courier COD remittance step.
 *
 * The courier declares a cash drop (mobile banking / agent / office) for an
 * overdue-or-pending due row they hold. Launch posture (recorded limitation):
 * this CLEARS the due on the courier's declaration — reconciliation against
 * the shop settlement is the S7 admin queue (A1/A5, M-3), not this stage.
 * Shortfalls are already recorded at delivery time (F-38, on the due row).
 *
 * Clearing the due lifts the dispatch hold automatically — the hold is
 * computed fresh from pending dues at pool-build and accept time.
 */
import { requireDeliveryAgent } from '@/lib/marketplaceRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { db } from '@/src/db';
import { courierRemittanceDues } from '@/src/db/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const remitSchema = z.object({
  note: z.string().max(300).optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid due id' }, { status: 400 });
    }

    const auth = await requireDeliveryAgent(request);
    const parsed = await parseJsonBody(request, remitSchema);
    if (!parsed.ok) return parsed.response;

    const updated = await db
      .update(courierRemittanceDues)
      .set({
        status: 'remitted',
        remitted_at: new Date(),
        remittance_note: parsed.data.note ?? null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(courierRemittanceDues.id, id),
          eq(courierRemittanceDues.delivery_man_user_id, auth.dbUser.id),
          eq(courierRemittanceDues.status, 'pending'),
        ),
      )
      .returning({ id: courierRemittanceDues.id });

    if (updated.length === 0) {
      return Response.json(
        { error: 'due_not_pending', message: 'Due not found or already settled' },
        { status: 409 },
      );
    }

    return Response.json({ success: true, id: updated[0].id }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return Response.json({ error: 'forbidden', message: 'Not an active delivery agent' }, { status });
    }
    logger.error('[delivery/remittance] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
