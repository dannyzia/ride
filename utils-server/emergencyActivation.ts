/**
 * emergencyActivation.ts — REST→WS bridge for emergency requests
 * (Phase 6, job 56). NEW FILE: same watermark pattern as activationJobs.ts
 * F46 (which is NOT edited here — the 2b lane is in it).
 *
 * Epoch-initialized watermark: on restart, still-broadcasting rows are
 * re-broadcast (idempotent crash recovery, TD-15). 2s interval — TTL is
 * only 120s.
 */
import { db } from '../src/db';
import type { DbClient } from './tx';
import { emergencyRequests } from '../src/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { broadcastEmergencyNewRequest } from './emergencyChain';

// Epoch-initialized: re-broadcast still-live emergencies on restart
let emergencyWatermark: Date = new Date(0);

/**
 * Job 56 scanner — broadcast broadcasting emergencies newer than the
 * watermark that have NOT expired to eligible certified drivers.
 */
export async function activateEmergencyRequests(tx: DbClient = db): Promise<number> {
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

  if (broadcasting.length === 0) return 0;

  let reached = 0;
  for (const req of broadcasting) {
    // F41 payload: NO patient_condition (service_level + pickup only)
    reached += await broadcastEmergencyNewRequest(req);
  }

  // Advance watermark past the newest row
  const newest = broadcasting.reduce(
    (max, r) => (new Date(r.created_at) > max ? new Date(r.created_at) : max),
    emergencyWatermark,
  );
  emergencyWatermark = newest;

  return reached;
}
