import { db } from '../src/db';
import { compensationQueue } from '../src/db/schema';
import { and, eq, lte } from 'drizzle-orm';
import { activateSubscription } from '../lib/activateSubscription';
import { logger } from '../lib/logger';

const MAX_ATTEMPTS = 10;

function backoffMs(attempt: number): number {
  return Math.min(30_000 * Math.pow(2, attempt), 30 * 60_000);
}

export function startCompensationWorker(): void {
  setInterval(async () => {
    try {
      const rows = await db.select().from(compensationQueue)
        .where(and(eq(compensationQueue.status, 'pending'), lte(compensationQueue.next_retry_at, new Date())))
        .limit(10);

      for (const row of rows) {
        try {
          await activateSubscription(row.payment_event_id);
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
  }, 30_000);
}
