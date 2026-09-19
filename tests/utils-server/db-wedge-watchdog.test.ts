/**
 * ISSUE-62 regression tests — DB wedge watchdog (utils-server/dbWatchdog.ts).
 *
 * The watchdog is the self-heal backstop for the Supavisor transaction-pooler
 * wedge (DB queue freezes while HTTP stays alive). These tests verify the
 * detection state machine with jest fake timers and a mocked db layer — no
 * real database required:
 *  - a single failed probe must NOT exit (transient blip tolerance)
 *  - WEDGE_THRESHOLD (2) consecutive failures must exit(1) for supervisor restart
 *  - a success after failures must reset the counter (recovery is not a wedge)
 *  - probeDbOnce must reject when the query exceeds its client-side timeout
 *    (the queue-wedge observable) and resolve on fast success
 *
 * Timer methodology: interval callbacks fire synchronously inside
 * advanceTimersByTime, but the watchdog's promise handlers are microtasks —
 * so all timer advancement uses `advanceTimersByTimeAsync`, which flushes
 * microtasks between ticks and lets the state machine actually progress.
 */
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
import { db } from "../../src/db";
import { logger } from "../../lib/logger";

const mockExecute = db.execute as jest.Mock;
let exitSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
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
    mockExecute.mockReturnValue(Promise.resolve({ rows: [{ "?column?": 1 }] }));
    await expect(probeDbOnce(1000)).resolves.toBeUndefined();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("rejects when the query stalls past the client-side timeout (wedge observable)", async () => {
    mockExecute.mockReturnValue(new Promise(() => {})); // never settles — the wedge shape
    const settled = probeDbOnce(50).catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(60);
    await expect(settled).resolves.toMatchObject({
      message: expect.stringContaining("db probe timeout"),
    });
  });
});

describe("startDbWatchdog state machine", () => {
  it("does NOT exit on a single failed probe (transient tolerance)", async () => {
    // mockRejectedValue (not an eager Promise.reject): the rejected promise is
    // created per call, where probeDbOnce attaches handlers synchronously —
    // an eagerly created rejection would trip jest's unhandled-rejection
    // check before the first tick.
    mockExecute.mockRejectedValue(new Error("boom"));
    startDbWatchdog(1000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "[db-watchdog] probe failed",
      expect.objectContaining({ consecutiveFailures: 1 }),
    );
  });

  it("exits with code 1 after WEDGE_THRESHOLD (2) consecutive failures", async () => {
    mockExecute.mockRejectedValue(new Error("boom"));
    startDbWatchdog(1000);
    // Two failed probes + the 150ms flush delay before process.exit.
    await jest.advanceTimersByTimeAsync(2200);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("resets the failure counter on a successful probe (recovery is not a wedge)", async () => {
    mockExecute
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValue(new Error("boom"));
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
