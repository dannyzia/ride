/**
 * redispatch.ts — R3.3 auto-redispatch trigger (design: docs/Plan/redispatch-r3-3-design.md §2).
 *
 * Dependency-injected so it is jest-testable without importing the WS server
 * (same rationale as dispatchChain.ts's header comment). No db/WS-server
 * runtime imports in this file — the real deps are bound by the caller
 * (utils-server/index.ts /internal/ride/cancelled handler).
 */
import type { rides } from "../src/db/schema";

export interface RedispatchTriggerDeps {
  getRide(rideId: string): Promise<typeof rides.$inferSelect | null>;
  dispatchPipeline(ride: typeof rides.$inferSelect): Promise<void>; // bind to (r) => dispatchRidePipeline(r, false)
  notifyRider(userId: string, msg: Record<string, unknown>): void;
  delayMs: number;
}

export async function runRedispatchTrigger(
  rideId: string,
  riderUserId: string | null,
  deps: RedispatchTriggerDeps,
): Promise<void> {
  if (riderUserId) {
    deps.notifyRider(riderUserId, { type: "ride:status", ride_id: rideId, status: "dispatching" });
  }
  if (deps.delayMs > 0) await new Promise((r) => setTimeout(r, deps.delayMs));
  const ride = await deps.getRide(rideId);
  if (!ride || ride.status !== "dispatching") return; // rider cancelled during the delay — no-op (§5)
  await deps.dispatchPipeline(ride);
}
