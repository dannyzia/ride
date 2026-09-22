/**
 * ISSUE-62 follow-up regression tests — the swappable application pool
 * (src/db/index.ts).
 *
 * The class these pin, live-verified 2026-09-20: a half-open connection makes
 * postgres.js hold a slot forever (the server's `statement_timeout` fires, but
 * the reply never arrives). With `max: 5` the slots drain until every query
 * queues behind a frozen pool while the HTTP layer stays responsive —
 * `/health` answered in 1.3ms while `/internal/dispatch` never answered and
 * `connected_riders` sat at 0 for over two hours.
 *
 * `db` is a Proxy so `recyclePool()` can install a replacement client and have
 * every existing importer reach the fresh pool. These tests pin:
 *  - property access forwards to the LIVE instance (the heal is visible through
 *    the exported binding — the whole point of the Proxy);
 *  - a function identity is stable while the pool is unchanged (bind is cached,
 *    so `db.select` is not a fresh closure per access);
 *  - `probeAppPool` is BOUNDED: a frozen pool yields a TIMEOUT result, never a
 *    hang, and a REJECTION is reported as a distinct, non-timeout outcome —
 *    collapsing those two is what made the watchdog recycle a healthy pool
 *    every ~58s on the live server (2026-09-20);
 *  - `recyclePool` builds a new client, force-closes the old one, and leaves the
 *    new one alone.
 *
 * Each test loads a FRESH module registry via `jest.isolateModules`, because the
 * pool is module-scoped state: without that, one test's recycle leaks into the
 * next and the construction assertions read someone else's pool.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// babel-jest hoists these above the imports, so the mocks are installed before
// src/db is loaded. The factories reference nothing outer — no TDZ risk.
jest.mock("postgres", () => ({
  __esModule: true,
  default: jest.fn(() => ({ end: jest.fn(() => Promise.resolve()) })),
}));

jest.mock("drizzle-orm/postgres-js", () => ({
  // Self-contained by necessity: a jest.mock factory may not close over
  // anything outer. `_self.limit` is the terminal step of the query-builder
  // chain probeAppPool verdicts on, so tests can override it per case.
  drizzle: jest.fn(() => {
    // Explicit type: the object references itself in `from`, which TypeScript
    // cannot infer otherwise (TS7022).
    const self: { from: () => unknown; limit: () => Promise<unknown[]> } = {
      from: jest.fn(() => self),
      limit: jest.fn(() => Promise.resolve([{ key: "dispatch_paused", value: "false" }])),
    };
    // The transaction handle handed to callers. Exposed as `_tx` so tests can
    // read exactly which statements the wrapper issued before the callback ran.
    const tx = { execute: jest.fn(() => Promise.resolve([])) };
    return {
      // A fresh object per instance, so tests can prove the Proxy switched
      // targets by identity. Non-function, so it is returned unbound.
      marker: {},
      execute: jest.fn(() => Promise.resolve([{ ok: 1 }])),
      select: jest.fn(() => self),
      _self: self,
      _tx: tx,
      transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
  }),
}));

// Avoid pulling the real (very large) drizzle schema into this unit test.
jest.mock("../../src/db/schema", () => ({}));

const postgresMock = postgres as unknown as jest.Mock;
const drizzleMock = drizzle as unknown as jest.Mock;

interface FacadeModule {
  db: Record<string, unknown>;
  probeAppPool: (timeoutMs: number) => Promise<
    | { ok: true }
    | { ok: false; reason: "timeout"; timeoutMs: number }
    | { ok: false; reason: "error"; error: string }
  >;
  recyclePool: () => Promise<void>;
}

/** Load src/db in its own registry and return its facade. */
function freshDb(): FacadeModule {
  process.env.DATABASE_URL = "postgres://user:pw@localhost:5432/test";
  let mod: FacadeModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../src/db") as FacadeModule;
  });
  if (!mod) throw new Error("src/db not loaded");
  return mod;
}

/** The drizzle instance most recently created by the mocked factory. */
function lastInstance(): {
  marker: object;
  execute: jest.Mock;
  select: jest.Mock;
  _self: { limit: jest.Mock };
  /** Transaction handle the wrapper hands the callback (the idle-bound tests). */
  _tx: { execute: jest.Mock };
  transaction: jest.Mock;
} {
  const results = drizzleMock.mock.results;
  return results[results.length - 1].value;
}

beforeEach(() => {
  postgresMock.mockClear();
  drizzleMock.mockClear();
});

describe("db facade", () => {
  it("forwards property access to the live pool instance", () => {
    const { db } = freshDb();
    expect(db.marker).toBe(lastInstance().marker);
  });

  it("keeps a stable function identity while the pool is unchanged", () => {
    const { db } = freshDb();
    // Bind is cached per property: a new closure per access would break
    // identity comparisons and allocate on every call site access.
    expect(db.select).toBe(db.select);
  });
});

describe("probeAppPool", () => {
  it("reports ok when the pool answers", async () => {
    const { probeAppPool } = freshDb();
    await expect(probeAppPool(50)).resolves.toEqual({ ok: true });
  });

  it("reports a TIMEOUT at its bound when the pool is frozen (never a hang)", async () => {
    const { probeAppPool } = freshDb();
    // The hung-socket shape: the query never settles, and the pool's own
    // statement_timeout cannot bound it because the reply is what is missing.
    const inst = lastInstance();
    inst._self.limit.mockReturnValue(new Promise(() => {}));
    jest.useFakeTimers();
    try {
      const settled = probeAppPool(50);
      await jest.advanceTimersByTimeAsync(60);
      await expect(settled).resolves.toEqual({
        ok: false,
        reason: "timeout",
        timeoutMs: 50,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("probes with the QUERY-BUILDER shape, never `execute(sql`…`)`", async () => {
    // The regression guard for the recycle loop of 2026-09-20. The old probe ran
    // `execute(sql`select 1`)`, a shape that never settles on this pool, so every
    // 10s tick burnt one of the five connections: the pool hit 0/5 in ~50s and
    // the watchdog recycled it forever (~58s cadence), dropping every device
    // socket. The probe must use the builder path the app itself uses.
    const { probeAppPool, db } = freshDb();
    const inst = lastInstance();
    inst.execute.mockReturnValue(new Promise(() => {})); // would hang forever
    await expect(probeAppPool(200)).resolves.toEqual({ ok: true });
    // It still must not touch the hanging shape at all — a fire-and-forget
    // `execute` would reserve a connection even though nothing awaits it.
    expect(inst.execute).not.toHaveBeenCalled();
    expect(typeof db.select).toBe("function");
  });

  it("reports a distinct ERROR (not a timeout) when the pool rejects the query", async () => {
    // The two failures mean OPPOSITE things: a timeout leaves its slot reserved
    // (a recycle is required), while a rejection has already released it. The
    // watchdog was recycling a healthy pool every ~58s on the live server
    // because both collapsed into one `false` — measured 2026-09-20, with the
    // pool answering in 3-8ms during every window it was called frozen.
    const { probeAppPool } = freshDb();
    lastInstance()._self.limit.mockReturnValue(Promise.reject(new Error("pool closed")));
    await expect(probeAppPool(50)).resolves.toEqual({
      ok: false,
      reason: "error",
      error: "pool closed",
    });
  });
});

describe("transaction idle bound", () => {
  // ISSUE-62, live-reproduced 2026-09-21: a postgres.js transaction whose promise
  // the caller stops awaiting keeps an open BEGIN, and its last statement has
  // already completed — so the backend sits `idle in transaction` and
  // `statement_timeout` can never fire. Measured on the live pool: one backend
  // parked that way for 88% of a 1.94h window (xact age to 6188s) while the pool
  // read 0/1 usable. Every abandoned transaction permanently burnt one of five
  // slots, and only `recyclePool()` ever got them back. The pool must therefore
  // bound IDLE transaction time server-side, before the callback runs.
  interface RawSql {
    queryChunks: { value: string[] }[];
  }
  const textOf = (q: unknown) => (q as RawSql).queryChunks[0].value.join("");

  it("issues the idle-in-transaction bound BEFORE the callback's own work", async () => {
    const { db } = freshDb();
    const inst = lastInstance();
    const seen: string[] = [];
    inst._tx.execute.mockImplementation((q: unknown) => {
      seen.push(textOf(q));
      return Promise.resolve([]);
    });

    await (
      db.transaction as (fn: (tx: typeof inst._tx) => Promise<unknown>) => Promise<unknown>
    )(async (tx) => {
      seen.push("job-body");
      await tx.execute({ queryChunks: [{ value: ["job-body-statement"] }] });
      return undefined;
    });

    expect(seen[0]).toBe("SET LOCAL idle_in_transaction_session_timeout = 120000");
    expect(seen[1]).toBe("job-body");
    expect(seen[2]).toBe("job-body-statement");
  });

  it("propagates the callback's rejection (the wrapper must not swallow it)", async () => {
    const { db } = freshDb();
    await expect(
      (db.transaction as (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>)(async () => {
        throw new Error("job failed");
      }),
    ).rejects.toThrow("job failed");
  });

  it("still bounds transactions after a recycle installs a fresh pool", async () => {
    const { db, recyclePool } = freshDb();
    await recyclePool();
    const inst = lastInstance();
    const seen: string[] = [];
    inst._tx.execute.mockImplementation((q: unknown) => {
      seen.push(textOf(q));
      return Promise.resolve([]);
    });

    await (db.transaction as (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>)(
      async () => undefined,
    );

    expect(seen).toEqual(["SET LOCAL idle_in_transaction_session_timeout = 120000"]);
  });
});

describe("recyclePool", () => {
  it("makes the NEXT query use a fresh client", async () => {
    const { db, recyclePool } = freshDb();
    const first = lastInstance();
    expect(db.marker).toBe(first.marker);

    await recyclePool();

    expect(drizzleMock).toHaveBeenCalledTimes(2);
    const second = lastInstance();
    expect(db.marker).toBe(second.marker);
    expect(db.marker).not.toBe(first.marker);
  });

  it("force-closes the old client and leaves the new one alone", async () => {
    const { recyclePool } = freshDb();
    const firstClient = postgresMock.mock.results[0].value;
    await recyclePool();
    const secondClient = postgresMock.mock.results[1].value;
    // timeout: 0 — the in-flight queries ARE the wedged slots and have already
    // blown their deadline, so waiting on them would recreate the hang.
    expect(firstClient.end).toHaveBeenCalledWith({ timeout: 0 });
    expect(secondClient.end).not.toHaveBeenCalled();
  });

  it("serves the replacement pool even if tearing the old one down throws", async () => {
    const { db, recyclePool } = freshDb();
    const firstClient = postgresMock.mock.results[0].value;
    firstClient.end.mockReturnValue(Promise.reject(new Error("already dead")));

    await expect(recyclePool()).resolves.toBeUndefined();

    // The swap happens BEFORE the teardown, so recovery does not depend on the
    // dying client cooperating.
    expect(db.marker).toBe(lastInstance().marker);
  });
});
