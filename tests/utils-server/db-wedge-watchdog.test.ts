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
 *  - only a pool-probe TIMEOUT recycles the pool; a rejected probe must NOT
 *    (collapsing the two destroyed a healthy pool every ~58s, live 2026-09-20)
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
  // The application-pool probe and the in-process heal. Mocked here so this
  // suite pins the watchdog's DECISION LOGIC; the probe/recycle mechanics
  // themselves are covered against the real module in
  // tests/db/pool-recycle.test.ts.
  probeAppPool: jest.fn(),
  probeAppPoolCapacity: jest.fn(),
  recyclePool: jest.fn(),
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
import { db, probeAppPool, probeAppPoolCapacity, recyclePool } from "../../src/db";
import { logger } from "../../lib/logger";

/**
 * The shared application pool. The DEDICATED reachability probe must never
 * touch this (guarded below) — the app-pool probe is a separate, deliberate
 * caller and is mocked wholesale in this suite.
 */
const mockExecute = db.execute as jest.Mock;
const mockProbeAppPool = probeAppPool as jest.Mock;
const mockProbeAppPoolCapacity = probeAppPoolCapacity as jest.Mock;
const mockRecyclePool = recyclePool as jest.Mock;
/** The tagged-template call on the dedicated probe client. */
let probeQuery: jest.Mock;
let exitSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  probeQuery = jest.fn();
  (getProbeClient as jest.Mock).mockReset();
  (getProbeClient as jest.Mock).mockReturnValue(probeQuery);
  mockExecute.mockReset();
  // Default: the application pool is healthy, so the pre-existing state-machine
  // tests exercise the reachability path only.
  mockProbeAppPool.mockReset();
  mockProbeAppPool.mockResolvedValue({ ok: true });
  // Default: the pool has LOST all capacity, so the timeout path recycles.
  // The partial-wedge case (settled > 0) is covered by its own test below.
  mockProbeAppPoolCapacity.mockReset();
  mockProbeAppPoolCapacity.mockResolvedValue({ settled: 0, attempts: 5 });
  mockRecyclePool.mockReset();
  mockRecyclePool.mockResolvedValue(undefined);
  (logger.info as jest.Mock).mockClear();
  (logger.error as jest.Mock).mockClear();
  (logger.warn as jest.Mock).mockClear();
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
    // `db.execute(...)` as the REACHABILITY probe, this fails. The app pool is
    // still exercised deliberately — through probeAppPool, on the path below.
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

describe("startDbWatchdog application-pool freeze detection", () => {
  beforeEach(() => {
    // The database ITSELF is reachable in every case here — only this
    // process's pool is unhealthy. That is the combination the dedicated probe
    // cannot see, and the one that froze the live server on 2026-09-20:
    // /health answered in 1.3ms while every DB-touching path parked forever.
    probeQuery.mockReturnValue(Promise.resolve([]));
  });

  it("recycles on the FIRST pool TIMEOUT — a timed-out probe cannot release its own slot", async () => {
    // The contract changed from "4 consecutive timeouts" precisely because
    // probeAppPool cannot release the connection it abandoned: every further
    // trying probe consumes another of the pool's five connections and deepens
    // the freeze it is waiting to confirm. A timeout IS the signal.
    mockProbeAppPool.mockResolvedValue({ ok: false, reason: "timeout", timeoutMs: 35_000 });
    mockProbeAppPoolCapacity.mockResolvedValue({ settled: 0, attempts: 5 });
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(logger.error).toHaveBeenCalledWith(
      "[db-watchdog] application pool frozen (database is reachable)",
      expect.objectContaining({ probeTimeoutMs: 35_000 }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "[db-watchdog] recycling application pool",
      expect.anything(),
    );
    expect(mockRecyclePool).toHaveBeenCalledTimes(1);
  });

  it("does NOT recycle while the database itself is unreachable (that path exits instead)", async () => {
    // A restart cannot help when the database is down, and recycling would
    // discard a healthy pool for nothing. Reachability failure keeps its own
    // (unchanged) contract.
    probeQuery.mockImplementation(() => Promise.reject(new Error("db unreachable")));
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(4200);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRecyclePool).not.toHaveBeenCalled();
  });

  it("logs recovery once the pool serves a query again", async () => {
    mockProbeAppPool
      .mockResolvedValueOnce({ ok: false, reason: "timeout", timeoutMs: 35_000 }) // frozen → heal
      .mockResolvedValue({ ok: true }); // healthy from here on
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockRecyclePool).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      "[db-watchdog] application pool recovered",
      expect.anything(),
    );
  });

  it("does NOT recycle while the pool still has capacity — a partial wedge is not a freeze", async () => {
    // The measured live defect of 2026-09-20: one connection never settled, so
    // the single probe timed out, but the pool served every other query in
    // 3-8ms. Recycling then destroyed a working pool — rejecting the healthy
    // connections' in-flight queries and dropping both phones' WebSockets. Only
    // zero remaining capacity justifies a recycle.
    mockProbeAppPool.mockResolvedValue({ ok: false, reason: "timeout", timeoutMs: 35_000 });
    mockProbeAppPoolCapacity.mockResolvedValue({ settled: 2, attempts: 5 });
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(3000);
    expect(mockRecyclePool).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "[db-watchdog] application pool partially wedged — still serving, NOT recycled",
      expect.objectContaining({ settled: 2, attempts: 5 }),
    );
  });

  it("does NOT recycle on a REJECTED probe — a released slot is not a frozen one", async () => {
    // The regression guard for the live defect of 2026-09-20: the probe's
    // `false` covered both "no reply" and "the query rejected", so a pooler
    // reaping one idle connection made the watchdog destroy a healthy pool
    // every ~58s. Each recycle rejected that pool's in-flight queries
    // (CONNECTION_DESTROYED) and dropped every device WebSocket, which is what
    // killed the phone sessions at the ~2-minute mark. Measured from outside
    // the process, the pool answered in 3-8ms during all 35s the internal probe
    // spent waiting.
    mockProbeAppPool.mockResolvedValue({
      ok: false,
      reason: "error",
      error: "write CONNECTION_DESTROYED",
    });
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(5000); // several ticks
    expect(mockRecyclePool).not.toHaveBeenCalled();
    // A rejection already released its slot, so there is no capacity question
    // to ask — the capacity probe must not even run.
    expect(mockProbeAppPoolCapacity).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "[db-watchdog] application-pool probe rejected — pool is serving, not frozen",
      expect.objectContaining({ error: "write CONNECTION_DESTROYED" }),
    );
  });

  it("checks the application pool on the application-pool path, after the dedicated probe", async () => {
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(probeQuery).toHaveBeenCalledTimes(1);
    expect(mockProbeAppPool).toHaveBeenCalledTimes(1);
  });
});
