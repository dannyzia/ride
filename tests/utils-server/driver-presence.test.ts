/**
 * Driver presence grace — regression tests for the policy in
 * `utils-server/driverPresence.ts`.
 *
 * These pin the contract behind the fix for a driver silently falling out of
 * dispatch: a phone that sleeps or is backgrounded drops its socket without the
 * driver deciding to stop working, and the disconnect path used to read that as
 * going offline (session closed AND `drivers.is_online` cleared). Measured
 * on-device 2026-09-20: a 45s background cycle ended the session, so the app's
 * recovery found no active session, went offline, and `drivers_indexed` fell to 0
 * until a human tapped "Go online".
 *
 * The tests exercise the real decision functions the server calls — the policy
 * is not re-implemented here. The DB writes the decision gates (closing
 * `driver_online_sessions` and clearing `drivers.is_online`) live in
 * `utils-server/index.ts`, which starts a listening server and is therefore not
 * importable in a unit test; that half is covered on-device and documented in the
 * commit for the change.
 */
import {
  DRIVER_DISCONNECT_GRACE_MS,
  decideDisconnect,
  dueForClose,
  noteDisconnect,
  noteReconnect,
  type PendingDisconnect,
} from "../../utils-server/driverPresence";

const DRIVER = "9f3aaef7-88cc-4a8f-a32a-dff9cb940ee2";
const T0 = 1_700_000_000_000;

describe("driver presence grace — a socket loss is not a decision", () => {
  it("holds online state when a socket drops and no window is open", () => {
    const registry = new Map<string, PendingDisconnect<string>>();

    expect(
      decideDisconnect({
        immediate: false,
        hasPending: false,
        now: T0,
      }),
    ).toBe("hold");
    expect(registry.size).toBe(0);
  });

  it("opens a window that outlives a realistic background cycle", () => {
    const registry = new Map<string, PendingDisconnect<string>>();

    noteDisconnect(registry, DRIVER, "ws-1", T0);

    // 45s is the background duration measured on-device; the window must cover
    // it with room to spare or the driver would go offline mid-cycle.
    expect(DRIVER_DISCONNECT_GRACE_MS).toBeGreaterThan(45_000);
    expect(registry.get(DRIVER)).toEqual({
      deadline: T0 + DRIVER_DISCONNECT_GRACE_MS,
      client: "ws-1",
    });
  });

  it("ignores a repeat notification inside an unexpired window", () => {
    const registry = new Map<string, PendingDisconnect<string>>();
    noteDisconnect(registry, DRIVER, "ws-1", T0);

    expect(
      decideDisconnect({
        immediate: false,
        hasPending: true,
        pendingDeadline: registry.get(DRIVER)?.deadline,
        now: T0 + 1_000,
      }),
    ).toBe("ignore");
  });

  it("closes once the window has run out with no reconnect", () => {
    const registry = new Map<string, PendingDisconnect<string>>();
    noteDisconnect(registry, DRIVER, "ws-1", T0);
    const deadline = registry.get(DRIVER)?.deadline;

    expect(
      decideDisconnect({
        immediate: false,
        hasPending: true,
        pendingDeadline: deadline,
        now: deadline as number,
      }),
    ).toBe("close");
  });

  it("keeps an admin suspension immediate, even inside an open window", () => {
    const registry = new Map<string, PendingDisconnect<string>>();
    noteDisconnect(registry, DRIVER, "ws-1", T0);

    expect(
      decideDisconnect({
        immediate: true,
        hasPending: true,
        pendingDeadline: registry.get(DRIVER)?.deadline,
        now: T0 + 1_000,
      }),
    ).toBe("close");
  });
});

describe("driver presence grace — a reconnect keeps the driver online", () => {
  it("cancels the pending window and reports that the state was kept", () => {
    const registry = new Map<string, PendingDisconnect<string>>();
    noteDisconnect(registry, DRIVER, "ws-1", T0);

    expect(noteReconnect(registry, DRIVER)).toBe(true);
    expect(registry.size).toBe(0);
    // A second registration on the same driver is no longer a "kept" reconnect:
    // there was no window left to cancel.
    expect(noteReconnect(registry, DRIVER)).toBe(false);
  });

  it("cannot be closed by a sweep racing the reconnect", () => {
    const registry = new Map<string, PendingDisconnect<string>>();
    noteDisconnect(registry, DRIVER, "ws-1", T0);
    const live = new Set([DRIVER]);

    const due = dueForClose(registry, T0 + DRIVER_DISCONNECT_GRACE_MS + 1, (id) =>
      live.has(id),
    );

    expect(due).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it("closes only drivers whose window expired without a live socket", () => {
    const reconnected = "b8e0f3b0-0f9f-4053-8e5c-94efa948da20";
    const gone = "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d";
    const stillWaiting = "7d8e9f00-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
    const registry = new Map<string, PendingDisconnect<string>>();
    noteDisconnect(registry, DRIVER, "ws-1", T0); // live again → excluded
    noteDisconnect(registry, reconnected, "ws-2", T0); // expired, not live → closed
    noteDisconnect(registry, gone, "ws-3", T0); // expired, not live → closed
    noteDisconnect(registry, stillWaiting, "ws-4", T0 + 60_000); // still open
    const live = new Set([DRIVER, reconnected]);

    const due = dueForClose(registry, T0 + DRIVER_DISCONNECT_GRACE_MS + 1, (id) =>
      live.has(id),
    );

    expect(due.map(([driverId]) => driverId)).toEqual([gone]);
    // Expired entries leave the registry either way — closed, or moot because
    // the socket came back. A window that has not run out is left alone.
    expect(registry.has(gone)).toBe(false);
    expect(registry.has(reconnected)).toBe(false);
    expect(registry.has(stillWaiting)).toBe(true);
  });
});
