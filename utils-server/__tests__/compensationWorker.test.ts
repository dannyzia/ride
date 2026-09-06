/**
 * P0-5 (gap ledger): compensationWorker — the previously-untested 30s repair
 * poller for payment_events (Z-2/Z-3 repair lane). Asserts:
 *  - picks up due pending rows and dispatches repairPaymentEvent by purpose
 *  - success → queue row marked completed
 *  - retryable failure → attempt_count incremented + exponential backoff
 *    (30s × 2^attempt, capped at 30 min) written into next_retry_at
 *  - MAX_ATTEMPTS (10) exceeded → row marked failed (poison-pill containment)
 *  - overlap guard: a tick slower than its interval never re-enters while a
 *    previous tick is still awaiting a repair (no double repair calls)
 */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock("../../lib/paymentRepair", () => ({
  repairPaymentEvent: jest.fn(),
}));
jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "../../src/db";
import { compensationQueue } from "../../src/db/schema";
import { repairPaymentEvent } from "../../lib/paymentRepair";
import { startCompensationWorker } from "../compensationWorker";

type TickFn = () => Promise<void>;

/** Capture the worker's interval callback without scheduling any real timer. */
function captureTick(): TickFn {
  let tick: TickFn | undefined;
  const spy = jest
    .spyOn(global, "setInterval")
    .mockImplementation(((fn: TickFn, ms: number) => {
      if (ms === 30_000) tick = fn;
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval);
  try {
    startCompensationWorker();
  } finally {
    spy.mockRestore();
  }
  if (!tick) throw new Error("compensationWorker 30s interval not registered");
  return tick;
}

interface UpdateLogEntry {
  table: unknown;
  set: Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function mockDb(options: { pendingRows: Array<Record<string, unknown>> }) {
  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(async () => options.pendingRows),
      })),
    })),
  }));

  const updates: UpdateLogEntry[] = [];
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Record<string, unknown>) => {
      updates.push({ table, set: setObj });
      return {
        where: jest.fn(async () => []),
      };
    }),
  }));
  return updates;
}

const ROW_BASE = {
  id: "cq-1",
  payment_event_id: "pe-1",
  status: "pending",
  attempt_count: 0,
};

describe("compensationWorker tick", () => {
  test("due pending rows are repaired and marked completed", async () => {
    const updates = mockDb({ pendingRows: [{ ...ROW_BASE }, { ...ROW_BASE, id: "cq-2", payment_event_id: "pe-2" }] });
    (repairPaymentEvent as jest.Mock).mockResolvedValue(undefined);
    const tick = captureTick();

    await tick();

    expect(repairPaymentEvent).toHaveBeenCalledWith("pe-1");
    expect(repairPaymentEvent).toHaveBeenCalledWith("pe-2");
    const completed = updates.filter((u) => u.table === compensationQueue && u.set.status === "completed");
    expect(completed).toHaveLength(2);
  });

  test("retryable failure increments attempt_count and backs off 30s × 2^attempt", async () => {
    const updates = mockDb({ pendingRows: [{ ...ROW_BASE, attempt_count: 0 }] });
    (repairPaymentEvent as jest.Mock).mockRejectedValue(new Error("gateway down"));
    const tick = captureTick();

    await tick();

    const retry = updates.find((u) => u.set.attempt_count !== undefined);
    expect(retry).toBeDefined();
    expect(retry!.set.attempt_count).toBe(1);
    expect(retry!.set.status).toBeUndefined();
    const backoffAt = retry!.set.next_retry_at as Date;
    // 30_000 × 2^1 = 60s
    expect(Number(backoffAt) - Number(jest.now())).toBe(60_000);
    expect(String(retry!.set.last_error)).toContain("gateway down");
  });

  test("backoff is capped at 30 minutes even for late attempts", async () => {
    const updates = mockDb({ pendingRows: [{ ...ROW_BASE, attempt_count: 8 }] });
    (repairPaymentEvent as jest.Mock).mockRejectedValue(new Error("still failing"));
    const tick = captureTick();

    await tick();

    const retry = updates.find((u) => u.set.attempt_count === 9);
    expect(retry).toBeDefined();
    // uncapped would be 30_000 × 2^9 = 15_360_000ms (256 min)
    expect(Number(retry!.set.next_retry_at) - Number(jest.now())).toBe(1_800_000);
  });

  test("MAX_ATTEMPTS (10) exceeded → row marked failed, no next_retry_at", async () => {
    const updates = mockDb({ pendingRows: [{ ...ROW_BASE, attempt_count: 9 }] });
    (repairPaymentEvent as jest.Mock).mockRejectedValue(new Error("poison"));
    const tick = captureTick();

    await tick();

    const failed = updates.find((u) => u.set.status === "failed");
    expect(failed).toBeDefined();
    expect(failed!.set.attempt_count).toBe(10);
    expect(failed!.set.next_retry_at).toBeUndefined();
  });

  test("overlap guard: a re-entrant tick while a repair is in flight does not re-query", async () => {
    let selectCalls = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      selectCalls += 1;
      return {
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(async () => (selectCalls === 1 ? [{ ...ROW_BASE }] : [])),
          })),
        })),
      };
    });
    const updates: UpdateLogEntry[] = [];
    (db.update as jest.Mock).mockImplementation((table: unknown) => ({
      set: jest.fn((setObj: Record<string, unknown>) => {
        updates.push({ table, set: setObj });
        return { where: jest.fn(async () => []) };
      }),
    }));

    // Deferred repair — the first tick blocks inside repairPaymentEvent.
    let release!: (v?: unknown) => void;
    (repairPaymentEvent as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    const tick = captureTick();

    const first = tick();
    // Second tick fires while the first is still awaiting the repair.
    await tick();

    expect(selectCalls).toBe(1);
    release();
    await first;

    expect(repairPaymentEvent).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u.set.status === "completed")).toBe(true);
  });
});
