/**
 * emergencyActivation.ts — REST→WS bridge for emergency requests
 * (Phase 6, job 56). Same watermark pattern as activationJobs.ts.
 *
 * Epoch-initialized watermark: on restart, still-broadcasting rows are
 * re-broadcast (idempotent crash recovery, TD-15). 2s interval — TTL is
 * only 120s.
 *
 * M4 (audit-fix): the alarm pushes are RETURNED as a notifyQueue; the
 * scheduler dispatches them via one sendNotifications batch AFTER
 * withJobBudget returns (Expo HTTP can no longer hold the scheduler
 * connection idle-in-transaction). M5: every tuple carries the
 * `emergency_activation:{id}:{userId}` idempotency key (see emergencyChain).
 */
import { db } from '../src/db';
import type { DbClient } from './tx';
import { emergencyRequests } from '../src/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import type { NotificationRequest } from '../lib/notify';
import { broadcastEmergencyNewRequest } from './emergencyChain';

// Epoch-initialized: re-broadcast still-live emergencies on restart
let emergencyWatermark: Date = new Date(0);

/**
 * Job 56 scanner — broadcast broadcasting emergencies newer than the
 * watermark that have NOT expired to eligible certified drivers.
 *
 * M4: WS relay stays here (in-memory, budget-safe); expo pushes are
 * RETURNED for post-budget dispatch by the scheduler.
 */
export async function activateEmergencyRequests(tx: DbClient = db): Promise<{
  count: number;
  notifyQueue: NotificationRequest[];
}> {
  const broadcasting = await tx
    .select({
      id: emergencyRequests.id,
      pickup_address: emergencyRequests.pickup_address,
      pickup_lat: emergencyRequests.pickup_lat,
      pickup_lng: emergencyRequests.pickup_lng,
      service_level: emergencyRequests.service_level,
      requires_paramedic: emergencyRequests.requires_paramedic,
      expires_at: emergencyRequests.expires_at,
      created_at: emergencyRequests.created_at,
    })
    .from(emergencyRequests)
    .where(
      and(
        eq(emergencyRequests.status, 'broadcasting'),
        gt(emergencyRequests.created_at, emergencyWatermark),
        gt(emergencyRequests.expires_at, new Date()), // TTL sweep (job 53) owns expiry
      ),
    );

  if (broadcasting.length === 0) return { count: 0, notifyQueue: [] };

  let count = 0;
  const notifyQueue: NotificationRequest[] = [];
  for (const req of broadcasting) {
    // F41 payload: NO patient_condition (service_level + pickup only).
    // M5: pushes collect into the queue with deterministic idempotency keys.
    count += await broadcastEmergencyNewRequest(req, notifyQueue);
  }

  // Advance watermark past the newest row
  const newest = broadcasting.reduce(
    (max, r) => (new Date(r.created_at) > max ? new Date(r.created_at) : max),
    emergencyWatermark,
  );
  emergencyWatermark = newest;

  return { count, notifyQueue };
}
