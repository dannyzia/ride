/**
 * redispatch.ts — R3.3 auto-redispatch trigger (design: docs/Plan/redispatch-r3-3-design.md §2).
 *
 * Dependency-injected so it is jest-testable without importing the WS server
 * (same rationale as dispatchChain.ts's header comment). No db/WS-server
 * runtime imports in this file — the real deps are bound by the caller
 * (utils-server/index.ts /internal/ride/cancelled handler).
 *
 * Currently a STUB: test-first red run per the execution order
 * (.kilo/plans/r3-completion-revert-and-reland.md §2b) — implementation lands
 * in the feat commit once the red run is recorded.
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
  void rideId;
  void riderUserId;
  void deps;
  throw new Error("not_implemented");
}
