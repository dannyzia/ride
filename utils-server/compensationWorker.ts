import { db } from '../src/db';
import { compensationQueue } from '../src/db/schema';
import { and, eq, lte } from 'drizzle-orm';
import { repairPaymentEvent } from '../lib/paymentRepair';
import { logger } from '../lib/logger';

const MAX_ATTEMPTS = 10;

function backoffMs(attempt: number): number {
  return Math.min(30_000 * Math.pow(2, attempt), 30 * 60_000);
}

export function startCompensationWorker(): void {
  // Overlap guard: a tick slower than 30s must not pick up the same
  // `status='pending'` rows twice and double-call activateSubscription.
  let tickRunning = false;
  setInterval(async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const rows = await db.select().from(compensationQueue)
        .where(and(eq(compensationQueue.status, 'pending'), lte(compensationQueue.next_retry_at, new Date())))
        .limit(10);

      for (const row of rows) {
        try {
          // Z-2: repair is dispatched by purpose (wallet topup / rider pass /
          // subscription). Previously every row went through
          // activateSubscription, which throws for wallet topups and rider
          // passes — those paid events could never be repaired.
          await repairPaymentEvent(row.payment_event_id);
          await db.update(compensationQueue).set({ status: 'completed', updated_at: new Date() })
            .where(eq(compensationQueue.id, row.id));
          logger.info('[compensationWorker] success', { id: row.id });
        } catch (err) {
          const newCount = row.attempt_count + 1;
          if (newCount >= MAX_ATTEMPTS) {
            await db.update(compensationQueue).set({ status: 'failed', attempt_count: newCount, last_error: String(err), updated_at: new Date() })
              .where(eq(compensationQueue.id, row.id));
            logger.error('[compensationWorker] MAX_RETRIES_EXCEEDED', { id: row.id, payment_event_id: row.payment_event_id });
          } else {
            await db.update(compensationQueue).set({
              attempt_count: newCount, last_error: String(err),
              next_retry_at: new Date(Date.now() + backoffMs(newCount)), updated_at: new Date(),
            }).where(eq(compensationQueue.id, row.id));
          }
        }
      }
    } catch (e) { logger.error('[compensationWorker] tick error', e); }
    finally { tickRunning = false; }
  }, 30_000);
}
