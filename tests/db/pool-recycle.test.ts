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
 *  - `probeAppPool` is BOUNDED: a frozen pool yields `false`, never a hang;
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
  drizzle: jest.fn(() => ({
    // A fresh object per instance, so tests can prove the Proxy switched
    // targets by identity. Non-function, so it is returned unbound.
    marker: {},
    execute: jest.fn(() => Promise.resolve([{ ok: 1 }])),
  })),
}));

// Avoid pulling the real (very large) drizzle schema into this unit test.
jest.mock("../../src/db/schema", () => ({}));

const postgresMock = postgres as unknown as jest.Mock;
const drizzleMock = drizzle as unknown as jest.Mock;

interface FacadeModule {
  db: Record<string, unknown>;
  probeAppPool: (timeoutMs: number) => Promise<boolean>;
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
function lastInstance(): { marker: object; execute: jest.Mock } {
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
  it("resolves true when the pool answers", async () => {
    const { probeAppPool } = freshDb();
    await expect(probeAppPool(50)).resolves.toBe(true);
  });

  it("resolves false at its bound when the pool is frozen (never a hang)", async () => {
    const { probeAppPool } = freshDb();
    // The hung-socket shape: the query never settles, and the pool's own
    // statement_timeout cannot bound it because the reply is what is missing.
    lastInstance().execute.mockReturnValue(new Promise(() => {}));
    jest.useFakeTimers();
    try {
      const settled = probeAppPool(50);
      await jest.advanceTimersByTimeAsync(60);
      await expect(settled).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("reports false when the pool errors", async () => {
    const { probeAppPool } = freshDb();
    lastInstance().execute.mockReturnValue(Promise.reject(new Error("pool closed")));
    await expect(probeAppPool(50)).resolves.toBe(false);
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
