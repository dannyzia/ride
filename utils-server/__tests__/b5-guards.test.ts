// @ts-nocheck — source-text pins over the unimportable WS server module.
/**
 * B5-2 + B5-3 guard pins (skeptic §B5, orchestrator-ruled).
 *
 * utils-server/index.ts boots the server on import (bare startup() call),
 * so its inline WS branches have no unit harness — the same reason the
 * scheduler ordering pins live as source assertions in
 * tests/api/scheduler/scheduler-phase0.test.ts. These pins follow that
 * house pattern: each fails if the guard is reverted, and each asserts
 * ORDER (guard precedes effect), not mere presence.
 *
 * B5-2: location:update carries the ride:arrived ownership guard —
 *   ride.driver_id === client.driverId gates the subscriber forward loop
 *   AND the deviation check. A non-owner update breaks out with
 *   not_your_ride before either effect.
 * B5-3: the stale-driver sweep passes its evicted client into
 *   handleDriverDisconnect (both the first call and the retry) so the
 *   driver_sessions row closes; and the session-close block actually
 *   reads driverSessionId off that client (a passed-but-ignored client
 *   would leak exactly like the old no-client call).
 */
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(join(__dirname, "..", "index.ts"), "utf8");

/** The location:update branch body (from its case to the next case). */
function locationBranch(): string {
  const start = SRC.indexOf('case "location"');
  expect(start).toBeGreaterThan(-1);
  const nextCase = SRC.indexOf('case "ride"', start);
  expect(nextCase).toBeGreaterThan(start);
  return SRC.slice(start, nextCase);
}

describe("B5-2 — location:update ownership guard", () => {
  it("the branch looks up the ride owner and rejects non-owners", () => {
    const branch = locationBranch();
    // The guard reads rides.driver_id for the update's ride...
    expect(branch).toContain("locRide.driver_id !== client.driverId");
    // ...and breaks out with the sibling error code (mirrors ride:arrived).
    expect(branch).toContain('message: "not_your_ride"');
  });

  it("the guard precedes BOTH the subscriber forward and the deviation check", () => {
    const branch = locationBranch();
    const guard = branch.indexOf("locRide.driver_id !== client.driverId");
    const forward = branch.indexOf('type: "location:driver"');
    const deviation = branch.indexOf("detectRouteDeviation(");
    expect(guard).toBeGreaterThan(-1);
    expect(forward).toBeGreaterThan(-1);
    expect(deviation).toBeGreaterThan(-1);
    // A non-owner update can reach neither effect: both sit after the
    // break-out. Deleting the guard (or moving an effect above it) flips this.
    expect(guard).toBeLessThan(forward);
    expect(guard).toBeLessThan(deviation);
  });
});

describe("B5-3 — stale sweep closes the driver_sessions row", () => {
  it("the stale-driver sweep passes its evicted client (first call + retry)", () => {
    // The sweep loop binds [driverId, client] — the leak was calling
    // handleDriverDisconnect(driverId) with no client, which skips the
    // driverSessionId-keyed session close while closing everything else.
    const calls = SRC.match(/handleDriverDisconnect\(driverId, client\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("the session-close block reads driverSessionId off the passed client", () => {
    // Guards against a passed-but-ignored client: the PATCH-4 close must
    // key off disconnecting.driverSessionId, else the leak persists.
    expect(SRC).toContain("disconnecting?.driverSessionId");
    expect(SRC).toContain("eq(driverSessions.id, disconnecting.driverSessionId)");
  });
});
