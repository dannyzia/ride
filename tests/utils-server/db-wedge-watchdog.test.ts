/**
 * ISSUE-62 regression tests — DB-reachability watchdog (utils-server/dbWatchdog.ts).
 *
 * The watchdog is the self-heal backstop for the DB-unreachable class (queue
 * freezes while HTTP stays alive). These tests verify the detection state
 * machine with jest fake timers and mocked DB layers — no real database.
 *
 * The design contract these tests pin (2026-09-20):
 *  - the probe runs on its DEDICATED connection (utils-server/dbProbe.ts) and
 *    NEVER on the shared application pool. Probing the shared pool was the
 *    false-positive root cause: max: 5 connections serve 58 scheduler jobs, so
 *    the probe timed out on queue wait while the database answered an
 *    independent client in 144–233ms, and the resulting self-kill loop dropped
 *    every device socket ~every 55s.
 *  - the dedicated connection itself (`max: 1`, memoized, never shared) is
 *    pinned in tests/utils-server/db-probe.test.ts, kept separate because this
 *    suite mocks that module wholesale.
 *  - a single failed probe must NOT exit (transient blip tolerance)
 *  - WEDGE_THRESHOLD (4) consecutive failures must exit(1) for supervisor restart
 *  - a success after failures must reset the counter (recovery is not a wedge)
 *  - probes are SERIALIZED: a still-pending probe must not be stacked by the
 *    next tick (overlapping probes double-counted one slow window)
 *  - probeDbOnce must reject when the query exceeds its client-side timeout
 *    and resolve on fast success
 *
 * Timer methodology: interval callbacks fire synchronously inside
 * advanceTimersByTime, but the watchdog's promise handlers are microtasks —
 * so all timer advancement uses `advanceTimersByTimeAsync`, which flushes
 * microtasks between ticks and lets the state machine actually progress.
 */
jest.mock("../../utils-server/dbProbe", () => ({
  getProbeClient: jest.fn(),
}));

jest.mock("../../src/db", () => ({
  db: {
    execute: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { probeDbOnce, startDbWatchdog } from "../../utils-server/dbWatchdog";
import { getProbeClient } from "../../utils-server/dbProbe";
import { db } from "../../src/db";
import { logger } from "../../lib/logger";

/** The shared application pool — the probe must never touch this. */
const mockExecute = db.execute as jest.Mock;
/** The tagged-template call on the dedicated probe client. */
let probeQuery: jest.Mock;
let exitSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  probeQuery = jest.fn();
  (getProbeClient as jest.Mock).mockReset();
  (getProbeClient as jest.Mock).mockReturnValue(probeQuery);
  mockExecute.mockReset();
  (logger.info as jest.Mock).mockClear();
  (logger.error as jest.Mock).mockClear();
  // Record-only (do not throw): process.exit fires inside a 150ms timer, and
  // a throwing mock inside a fake-timer callback surfaces as an unrelated
  // async error. The assertions below check the call itself.
  exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
});

afterEach(() => {
  jest.useRealTimers();
  exitSpy.mockRestore();
});

describe("probeDbOnce", () => {
  it("resolves when the query completes within the timeout", async () => {
    probeQuery.mockReturnValue(Promise.resolve([{ "?column?": 1 }]));
    await expect(probeDbOnce(1000)).resolves.toBeUndefined();
    expect(probeQuery).toHaveBeenCalledTimes(1);
  });

  it("rejects when the query stalls past the client-side timeout (unreachable observable)", async () => {
    probeQuery.mockReturnValue(new Promise(() => {})); // never settles — the hung-socket shape
    const settled = probeDbOnce(50).catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(60);
    await expect(settled).resolves.toMatchObject({
      message: expect.stringContaining("db probe timeout"),
    });
  });

  it("probes through the dedicated client, never the shared application pool", async () => {
    probeQuery.mockReturnValue(Promise.resolve([]));
    await probeDbOnce(1000);
    expect(probeQuery).toHaveBeenCalledTimes(1);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("startDbWatchdog state machine", () => {
  it("does NOT exit on a single failed probe (transient tolerance)", async () => {
    // A fresh rejection per call (not a shared eager Promise.reject): the
    // rejected promise is created inside the call, where probeDbOnce attaches
    // handlers synchronously — an eager rejection would trip jest's
    // unhandled-rejection check before the first tick.
    probeQuery.mockImplementation(() => Promise.reject(new Error("boom")));
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "[db-watchdog] probe failed",
      expect.objectContaining({ consecutiveFailures: 1 }),
    );
  });

  it("exits with code 1 after WEDGE_THRESHOLD (4) consecutive failures", async () => {
    probeQuery.mockImplementation(() => Promise.reject(new Error("boom")));
    startDbWatchdog(1000);
    // Four failed probes + the 150ms flush delay before process.exit.
    await jest.advanceTimersByTimeAsync(4200);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does NOT exit before the threshold is reached (3 failures)", async () => {
    probeQuery.mockImplementation(() => Promise.reject(new Error("boom")));
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(3200);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "[db-watchdog] probe failed",
      expect.objectContaining({ consecutiveFailures: 3 }),
    );
  });

  it("serializes probes — a pending probe is not stacked by later ticks", async () => {
    // A probe that never settles: the hung-socket shape. With overlapping
    // probes several would run at once and each would bump the same counter,
    // so a single slow window could exit the process on its own.
    probeQuery.mockReturnValue(new Promise(() => {}));
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(5000); // 5 ticks, only the first probes
    expect(probeQuery).toHaveBeenCalledTimes(1);
  });

  it("never touches the shared application pool, even while exiting", async () => {
    // The regression guard for the whole class: if someone reintroduces
    // `db.execute(...)` as the probe, this fails.
    probeQuery.mockImplementation(() => Promise.reject(new Error("boom")));
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(4200);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("resets the failure counter on a successful probe (recovery is not a wedge)", async () => {
    probeQuery
      .mockImplementationOnce(() => Promise.reject(new Error("blip")))
      .mockImplementationOnce(() => Promise.resolve([]))
      .mockImplementation(() => Promise.reject(new Error("boom")));
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(1000); // fail #1
    await jest.advanceTimersByTimeAsync(1000); // success — counter reset
    await jest.advanceTimersByTimeAsync(1000); // fail #1 again (not #2)
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "[db-watchdog] probe recovered",
      expect.objectContaining({ consecutiveFailures: 1 }),
    );
  });
});
