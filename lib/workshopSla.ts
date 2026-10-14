/**
 * workshopSla.ts — F-13 2h confirm-SLA AUTO-DECLINE (plan 27 §13 S4).
 *
 * The SLA is enforced LAZILY by every reader and writer of workshop
 * requests (shop inbox GET, customer request GET, transition PATCH, shop
 * dashboard): one conditional UPDATE flips every expired `requested` row to
 * `declined` — persisted once, no daemon. S3 shipped the SLA as TRACKED-only
 * pending an owner decision; S4's stage order makes auto-decline the build.
 *
 * F-29: the customer notification for a decline is a SINGLE high-priority
 * push deduped on an idempotency key — any number of lazy triggers yields
 * exactly one notification (delivery-class events are never batched).
 */
import { db } from '@/src/db';
import { workshopRequests } from '@/src/db/schema';
import { sendNotification } from './notify';
import { logger } from './logger';
import { and, eq, lt, type SQL } from 'drizzle-orm';

export const WORKSHOP_CONFIRM_SLA_HOURS = 2;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface WorkshopSlaScope {
  /** Limit the sweep to one shop (inbox / dashboard / PATCH paths). */
  shopId?: string;
  /** Limit the sweep to one customer (my-requests path). */
  customerId?: string;
}

export interface DeclinedWorkshopRequest {
  id: string;
  customer_user_id: string;
  shop_id: string;
}

/**
 * Flip every expired `requested` row to `declined` and notify the customer.
 * Call BEFORE reading (GETs) or transitioning (PATCH) so every surface sees
 * the same persisted state. Returns the rows declined in THIS call (empty
 * is the common case — the update is conditional and idempotent).
 */
export async function applyWorkshopSla(
  scope: WorkshopSlaScope = {},
  exec: typeof db | Tx = db,
): Promise<DeclinedWorkshopRequest[]> {
  const cutoff = new Date(Date.now() - WORKSHOP_CONFIRM_SLA_HOURS * 3_600_000);
  const conds: SQL[] = [
    eq(workshopRequests.status, 'requested'),
    lt(workshopRequests.created_at, cutoff),
  ];
  if (scope.shopId) conds.push(eq(workshopRequests.shop_id, scope.shopId));
  if (scope.customerId) {
    conds.push(eq(workshopRequests.customer_user_id, scope.customerId));
  }

  const declined = (await exec
    .update(workshopRequests)
    .set({ status: 'declined', updated_at: new Date() })
    .where(and(...conds))
    .returning({
      id: workshopRequests.id,
      customer_user_id: workshopRequests.customer_user_id,
      shop_id: workshopRequests.shop_id,
    })) as DeclinedWorkshopRequest[];

  for (const row of declined) {
    // Fire-and-forget: the push never blocks the read/transition it rode in
    // on; the idempotency key makes a later duplicate trigger a no-op.
    sendNotification(
      row.customer_user_id,
      'workshop:request_declined',
      'Service request expired',
      `The shop did not confirm your request within ${WORKSHOP_CONFIRM_SLA_HOURS}h. Pick another window or send a new request.`,
      { request_id: row.id, shop_id: row.shop_id },
      { priority: 'high', idempotencyKey: `workshop_declined:${row.id}` },
    ).catch((err: unknown) =>
      logger.warn('[workshopSla] declined notify failed', {
        requestId: row.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return declined;
}
