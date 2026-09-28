// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (house pattern: tests/api/fleet/fleet-add-flows.test.ts).
/**
 * Owner ruling 2026-09-27 — launch_free at registration.
 *
 * POST /api/register (driver path) must auto-activate the "Launch Free"
 * subscription THROUGH the write-ownership chain only:
 *   lib/paymentEvents.createZeroAmountPaymentEvent → lib/activateSubscription.
 * Idempotent: a driver already holding any active subscription is skipped
 * (grantLaunchFreeIfEligible returns already_active; exactly one payment event).
 * Rider path must NOT grant. A grant failure must NOT fail the registration
 * (non-fatal, logged) — the backfill covers stragglers at launch.
 *
 * The route's Supabase admin create + verification consume are mocked; the real
 * grant chain runs (its db/select/insert routes through this test's mock).
 */
/* eslint-disable import/first */
jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: jest.fn(async () => ({
          data: { user: { id: "auth-uid-1" } },
          error: null,
        })),
        deleteUser: jest.fn(async () => ({ error: null })),
      },
    },
  },
}));
jest.mock("@/lib/verifiedPhones", () => ({
  consumeVerification: jest.fn(() => true),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn((...a: unknown[]) => {
      const inner = (a[1] as { error?: unknown })?.error;
      // Debug-only: surfaced while stabilizing the mock; keep silent in CI.
      if (process.env.DEBUG_LAUNCH_FREE) {
        // eslint-disable-next-line no-console
        console.log(
          "LIB-ERR",
          a[0],
          inner instanceof Error ? inner.message : JSON.stringify(inner),
        );
      }
    }),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── DB mock: tx-scoped recorder for users/fleets/fleetMembers/drivers/packages/
// paymentEvents/subscriptions/callLedger selects+inserts (route + grant chain). ──
let mockPackageRows: Record<string, unknown>[] = [];
let mockSubscriptionRows: Record<string, unknown>[] = [];
let mockInserts: { table: unknown; vals: Record<string, unknown> }[] = [];
let mockSelectQueue: unknown[][] = [];
const USER_ID = "66666666-6666-4666-8666-666666666666";
const DRIVER_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "9adf6c88-0000-4000-8000-0000000000aa";
const AUTH_UID = "auth-uid-1";

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  // Table-aware resolution for the FALLBACK chain (no queued rows): subscriptions/
  // packages resolve from their row stores; paymentEvents read-back serves the
  // insert recorder (latest first — eq(id) is opaque to the mock and the caller
  // destructures [evt]); creditVouchers and ad-hoc → empty.
  const resolveTableRows = (source: unknown): Promise<unknown[]> => {
    if (source === schema.subscriptions)
      return Promise.resolve(structuredClone(mockSubscriptionRows));
    if (source === schema.packages)
      return Promise.resolve(structuredClone(mockPackageRows));
    if (source === schema.paymentEvents) {
      const evtRows = mockInserts
        .filter((i) => i.table === schema.paymentEvents)
        .map((i, idx) => ({ ...i.vals, id: i.vals.id ?? `evt-${idx}` }))
        .reverse();
      return Promise.resolve(structuredClone(evtRows));
    }
    return Promise.resolve([]);
  };
  // rows === null → table-aware fallback on EVERY consumption path (then, limit,
  // returning). M-3 test fix: ensureLaunchFreePackage's .limit(1) recheck used to
  // hit the raw-rows path and could never see an existing plan row.
  const chain = (rows: unknown[] | null) => {
    const c: any = () => {};
    let source: unknown = null;
    const finish = () =>
      rows !== null
        ? Promise.resolve(structuredClone(rows))
        : resolveTableRows(source);
    const proxy = new Proxy(c, {
      get(target: any, prop) {
        if (prop === Symbol.toPrimitive || prop === "then") {
          return (res: any, rej: any) => finish().then(res, rej);
        }
        return target[prop];
      },
    });
    c.from = (t: unknown) => { source = t; return proxy; };
    c.where = () => proxy;
    c.limit = () => finish();
    c.for = () => proxy;
    c.then = (res: any, rej: any) => finish().then(res, rej);
    c.returning = () => finish();
    return proxy;
  };
  const makeDb = (inTx: boolean) => {
    const api: any = {
      select: jest.fn((..._args: unknown[]) => {
        const next = mockSelectQueue.shift();
        if (next) return chain(next as unknown[]);
        // Table-aware fallback: subscriptions/packages resolve from their row
        // stores; anything else resolves empty.
        return chain(null);
      }),
      insert: jest.fn((table: unknown) => ({
        values: jest.fn((vals: Record<string, unknown>) => {
          // recordOnce: every insert is recorded exactly once regardless of how
          // the chain is consumed (callLedger inserts are awaited directly with
          // no .returning(); users/fleets/drivers/payment_events/subscriptions
          // resolve typed rows through .returning()).
          let recorded = false;
          const recordOnce = () => {
            if (!recorded) {
              recorded = true;
              mockInserts.push({ table, vals });
            }
          };
          const rowFor = (t: unknown) => {
            if (t === schema.subscriptions) return [{ ...vals, id: "sub-new" }];
            if (t === schema.paymentEvents) return [{ ...vals, id: "evt-new" }];
            if (t === schema.packages) return [{ ...vals, id: PLAN_ID }];
            if (t === schema.callLedger) return [];
            if (t === schema.users) return [{ ...vals, id: USER_ID, auth_uid: AUTH_UID }];
            if (t === schema.drivers) return [{ ...vals, id: DRIVER_ID }];
            return [{ ...vals, id: "row-new" }];
          };
          const chained: any = {
            onConflictDoNothing: () => ({
              returning: () => {
                recordOnce();
                return Promise.resolve(rowFor(table));
              },
            }),
            returning: () => {
              recordOnce();
              return Promise.resolve(rowFor(table));
            },
          };
          chained.then = (
            res?: (v: unknown) => unknown,
            rej?: (e: unknown) => unknown,
          ) => {
            recordOnce();
            return Promise.resolve(rowFor(table)).then(res, rej);
          };
          return chained;
        }),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
      })),
      execute: jest.fn(async () => undefined),
    };
    return api;
  };
  return {
    db: Object.assign(makeDb(false), {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDb(true))),
    }),
  };
});

import { db } from "@/src/db";
import * as schema from "@/src/db/schema";
import { POST as registerRoute } from "@/app/api/register+api";
import {
  grantLaunchFreeIfEligible,
  ensureLaunchFreePackage,
} from "@/lib/launchFreeSubscription";

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const driverBody = () => ({
  phone: "+8801700000099",
  name: "Launch Free Driver",
  role: "driver",
  password: "test1234",
  vehicle_type: "bike_basic",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPackageRows = [{ id: PLAN_ID, name: "Launch Free", price_bdt: 0, call_count: -1, is_trial: false, duration_days: 36500 }];
  mockSubscriptionRows = [];
  mockInserts = [];
  mockSelectQueue = [];
});

describe("POST /api/register — launch_free hook (owner ruling 2026-09-27)", () => {
  it("driver registration activates launch_free through the write-ownership chain: exactly one payment_event + one subscription + one initial_load", async () => {
    const res = await registerRoute(makeRequest(driverBody()));
    expect(res.status).toBe(201);

    const insertedEvents = mockInserts.filter((i) => i.table === schema.paymentEvents);
    const insertedSubs = mockInserts.filter((i) => i.table === schema.subscriptions);
    const ledgerRows = mockInserts.filter((i) => i.table === schema.callLedger);
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0].vals.amount_bdt).toBe(0);
    expect(insertedEvents[0].vals.purpose).toBe("driver_package");
    expect(insertedEvents[0].vals.idempotency_key).toBe(`launch_free_${DRIVER_ID}`);
    expect(insertedSubs).toHaveLength(1);
    expect(insertedSubs[0].vals.calls_remaining).toBe(-1); // unlimited sentinel
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].vals.event_type).toBe("initial_load");
    expect(ledgerRows[0].vals.delta).toBe(-1);
  });

  it("rider registration does NOT grant launch_free", async () => {
    const res = await registerRoute(
      makeRequest({ ...driverBody(), role: "rider", vehicle_type: undefined }),
    );
    expect(res.status).toBe(201);
    expect(mockInserts.filter((i) => i.table === schema.paymentEvents)).toHaveLength(0);
    expect(mockInserts.filter((i) => i.table === schema.subscriptions)).toHaveLength(0);
  });

  it("registration succeeds even when the grant fails (non-fatal; backfill covers stragglers)", async () => {
    // Isolate mutations to THIS test so later tests are unaffected
    // (db.transaction/insert are module-level singletons).
    const originalTransaction = db.transaction;
    const originalInsert = db.insert;
    try {
      (db as any).transaction = jest.fn(async () => {
        // Registration tx succeeds…
        return { user_id: USER_ID, driver_id: DRIVER_ID, role: "driver" };
      });
      // …then the standalone grant chain blows up on the payment-event insert.
      (db as any).insert = jest.fn(() => {
        throw new Error("payment_events down");
      });
      const res = await registerRoute(makeRequest(driverBody()));
      expect(res.status).toBe(201); // registration NOT failed by the grant error
      const body = await res.json();
      expect(body.user_id).toBe(USER_ID);
    } finally {
      (db as any).transaction = originalTransaction;
      (db as any).insert = originalInsert;
    }

  });

  it("grantLaunchFreeIfEligible skips a driver already holding an active subscription (exactly zero writes)", async () => {
    mockSelectQueue = [[{ id: "sub-existing" }]]; // active-sub probe hits
    const result = await grantLaunchFreeIfEligible({
      driver_id: DRIVER_ID,
      idempotency_key: `launch_free_${DRIVER_ID}`,
    });
    expect(result.outcome).toBe("already_active");
    expect(mockInserts.filter((i) => i.table === schema.paymentEvents)).toHaveLength(0);
    expect(mockInserts.filter((i) => i.table === schema.subscriptions)).toHaveLength(0);
  });

  it("ensureLaunchFreePackage creates the plan row when absent (unlimited, ৳0, long duration)", async () => {
    mockPackageRows = [];
    const plan = await ensureLaunchFreePackage();
    const insertedPackages = mockInserts.filter((i) => i.table === schema.packages);
    expect(insertedPackages).toHaveLength(1);
    expect(insertedPackages[0].vals.call_count).toBe(-1);
    expect(insertedPackages[0].vals.price_bdt).toBe(0);
    expect(insertedPackages[0].vals.name).toBe("Launch Free");
    expect(plan.id).toBe(PLAN_ID);
  });

  it("M-3: concurrent ensure creators converge on ONE plan row (in-lock recheck contract)", async () => {
    // The audit (M-3): packages.name has no unique constraint, so the old
    // onConflictDoNothing() was a silent no-op — two racing creators could each
    // insert their own "Launch Free" row. The fix serializes on a transaction-
    // scoped advisory lock and rechecks inside the lock. In production the
    // loser's RECHECK sees the winner's committed row (served here by the
    // table-aware select) and must NOT insert; the first-insert-throws path
    // models the loser losing the race entirely and surfacing the error.
    mockPackageRows = [];
    const originalInsert = db.insert;
    const originalTransaction = db.transaction;
    try {
      // ensureLaunchFreePackage runs inside db.transaction — route the tx to the
      // ROOT mock so the insert override applies inside the transaction.
      (db as any).transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
      let calls = 0;
      (db as any).insert = jest.fn((table: unknown) => {
        calls += 1;
        if (calls === 1) throw new Error("duplicate plan row (simulated race loser)");
        return originalInsert(table);
      });

      // Loser attempt: insert throws, ensure surfaces the error (caller retries).
      await expect(ensureLaunchFreePackage()).rejects.toThrow(/duplicate plan row/);

      // Winner attempt: insert succeeds.
      const plan = await ensureLaunchFreePackage();
      expect(plan.id).toBe(PLAN_ID);

      // Exactly ONE package insert reached the recorder across both attempts —
      // a retry loop or broken contract would insert twice.
      expect(mockInserts.filter((i) => i.table === schema.packages)).toHaveLength(1);
    } finally {
      (db as any).insert = originalInsert;
      (db as any).transaction = originalTransaction;
    }
  });

  it("M-3: ensure reuses an existing plan row instead of inserting a duplicate (in-lock recheck)", async () => {
    mockPackageRows = [{ id: PLAN_ID, name: "Launch Free", price_bdt: 0, call_count: -1, is_trial: false, duration_days: 36500 }];
    const plan = await ensureLaunchFreePackage();
    expect(plan.id).toBe(PLAN_ID);
    expect(mockInserts.filter((i) => i.table === schema.packages)).toHaveLength(0);
  });
});
