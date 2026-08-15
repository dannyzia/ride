import { db } from '@/src/db';
import { rides, cancellationPolicies } from '@/src/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Evaluate cancellation fee by querying DB-driven cancellation_policies.
 * Returns { feeBdt, reason } where feeBdt is in integer paisa.
 *
 * Accepts either a rideId (re-read from the DB) or an already-fetched ride
 * snapshot. Callers that flip the ride status BEFORE evaluating (the cancel
 * race fix) MUST pass the snapshot — re-reading would see status='cancelled'
 * and match no policy, silently dropping the fee.
 */
export async function evaluateCancellation(
  rideIdOrSnapshot: string | { status: string; created_at: Date },
  cancelledBy: 'rider' | 'driver',
): Promise<{ feeBdt: number; reason: string }> {
  const ride =
    typeof rideIdOrSnapshot === 'string'
      ? (await db
          .select({ status: rides.status, created_at: rides.created_at })
          .from(rides)
          .where(eq(rides.id, rideIdOrSnapshot))
          .limit(1))[0]
      : rideIdOrSnapshot;
  if (!ride) return { feeBdt: 0, reason: 'ride_not_found' };

  const elapsedSec = (Date.now() - new Date(ride.created_at).getTime()) / 1000;

  const policies = await db
    .select()
    .from(cancellationPolicies)
    .where(
      and(
        eq(cancellationPolicies.is_active, true),
        eq(cancellationPolicies.canceller_role, cancelledBy),
        eq(cancellationPolicies.ride_status, ride.status),
      ),
    )
    .orderBy(desc(cancellationPolicies.priority), sql`${cancellationPolicies.time_threshold_seconds} asc`);

  // Find the first matching policy where elapsed >= time_threshold
  for (const policy of policies) {
    if (elapsedSec >= policy.time_threshold_seconds) {
      let fee = policy.fee_amount_bdt;
      if (policy.fee_type === 'flat') {
        fee = Math.min(fee, policy.max_fee_bdt);
      } else if (policy.fee_type === 'percent') {
        // Not used yet — reserved for future
      }
      return { feeBdt: fee, reason: `cancellation_${cancelledBy}_${policy.name}` };
    }
  }

  // No matching policy within thresholds
  return { feeBdt: 0, reason: 'within_grace_period' };
}
