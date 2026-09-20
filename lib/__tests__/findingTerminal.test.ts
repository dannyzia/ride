/**
 * Guards the evidence rule that keeps finding-driver from reporting a
 * dispatch-connectivity failure as a supply problem.
 *
 * The defect this pins (device-observed 2026-09-20): the screen held a socket
 * that was not delivering, so its 30s guard could not fire (it tested `!ws`)
 * and its 120s guard asserted "No drivers available". Silence over a broken
 * channel is not evidence of an empty pool — and the nearby poll cannot rescue
 * the claim either, because a wedged dispatch layer makes that count read 0 as
 * well (`connected_riders: 0` together with `drivers_indexed: 0` was the
 * observed shape).
 *
 * Socket liveness itself is covered in riderSocket.test.ts — it depends on the
 * handshake state that lives with the socket.
 */
import { resolveTerminalFindingState } from "../findingTerminal";

describe("resolveTerminalFindingState", () => {
  it("reports the connection when the channel is dead, even if the poll read an empty pool", () => {
    // The observed outage: nothing could reach dispatch AND the count read 0
    // because nothing was answering. Claiming no_drivers here is the misreport
    // this rule exists to prevent.
    expect(
      resolveTerminalFindingState({ socketLive: false, lastNearbyCount: 0 }),
    ).toBe("ws_timeout");
  });

  it("reports the connection when the channel is dead, whatever the poll saw", () => {
    for (const count of [null, 0, 1, 7]) {
      expect(
        resolveTerminalFindingState({ socketLive: false, lastNearbyCount: count }),
      ).toBe("ws_timeout");
    }
  });

  it("claims no_drivers only over a live channel with an independently empty poll", () => {
    expect(
      resolveTerminalFindingState({ socketLive: true, lastNearbyCount: 0 }),
    ).toBe("no_drivers");
  });

  it("does NOT claim no_drivers over a live channel when the poll saw drivers", () => {
    // Drivers exist, so a silent socket means we could not be told — the
    // connection state is the truthful outcome, not a supply claim.
    for (const count of [1, 7]) {
      expect(
        resolveTerminalFindingState({ socketLive: true, lastNearbyCount: count }),
      ).toBe("ws_timeout");
    }
  });

  it("does NOT claim no_drivers when the HTTP channel never answered", () => {
    // null = no successful poll. Nothing is proven, so asserting an empty pool
    // would be a guess.
    expect(
      resolveTerminalFindingState({ socketLive: true, lastNearbyCount: null }),
    ).toBe("ws_timeout");
  });

  it("never returns a non-terminal state", () => {
    for (const socketLive of [true, false]) {
      for (const count of [null, 0, 1, 5]) {
        expect(["no_drivers", "ws_timeout"]).toContain(
          resolveTerminalFindingState({ socketLive, lastNearbyCount: count }),
        );
      }
    }
  });
});
