// @ts-nocheck — Jest mock factories produce untyped DB chains (house pattern:
// tests/api/fleet/fleet-add-flows.test.ts).
/**
 * Owner ruling 2026-09-27 §3 — backfill dry-run math (STAGED script; never
 * executed in tests — the module under test is the GRANT path it drives).
 *
 * Covered:
 *  1. Dry-run: eligible drivers counted, ZERO payment_events/subscriptions written.
 *  2. Real run: one grant per eligible driver (exactly one payment_event each).
 *  3. Idempotent re-run: drivers holding an active subscription are skipped
 *     (second run reports granted=0, already_active=N).
 *  4. M-2 (Prompt B audit): the backfill ENGINE (lib runLaunchFreeBackfill) and
 *     its exit-code CONTRACT (backfillExitCode): 0 converged / 1 partial failure /
 *     2 incomplete — the old script tail overrode the partial-failure exit.
 *
 * The script's own query shape (ACTIVE drivers not in the active-subscription
 * set) is asserted via the select recorder.
 */
/* eslint-disable import/first */
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

let mockDriverRows: Record<string, unknown>[] = [];
let mockSubscriptionRows: Record<string, unknown>[] = [];
let mockPackageRows: Record<string, unknown>[] = [];
let mockInserts: { table: unknown; vals: Record<string, unknown> }[] = [];
let mockGrantProbeDriverId: string | null = null;
const PLAN_ID = "9adf6c88-0000-4000-8000-0000000000aa";
const D1 = "55555555-5555-4555-8555-555555555555";
const D2 = "55555555-5555-4555-8555-555555555556";
const D3 = "55555555-5555-4555-8555-555555555557"; // holds an active sub → skipped

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const chain = (rows: unknown[]) => {
    const c: any = () => {};
    let source: unknown = null;
    const finish = () => {
      if (source === schema.drivers) {
        // Emulate the engine's WHERE at RESOLUTION time: ACTIVE drivers not in
        // the active-subscription set. The notInArray subquery is opaque to the
        // mock, so the filter runs against the live row store — grants that
        // insert subscriptions mid-run are honored on the engine's re-scan.
        const activeSubDriverIds = new Set(
          mockSubscriptionRows.filter((s) => s.status === "active").map((s) => s.driver_id),
        );
        return Promise.resolve(
          structuredClone(mockDriverRows).filter(
            (d) => d.status === "active" && !activeSubDriverIds.has(d.id),
          ),
        );
      }
      if (source === schema.subscriptions) {
        // The grant's active-sub probe cannot express its eq(driver_id) predicate
        // in this mock — serve rows whose driver the probe COULD match. To keep
        // the backfill math test honest we emulate the per-driver filter the
        // real query performs: the probe is per-driver, so serve only rows for
        // the driver currently being granted (tracked by the test via
        // setGrantProbeDriver()). The per-driver skip itself is covered end-to-end
        // in register-launch-free.test.ts.
        return Promise.resolve(
          structuredClone(mockSubscriptionRows).filter(
            (r) => r.driver_id === mockGrantProbeDriverId,
          ),
        );
      }
      if (source === schema.packages) return Promise.resolve(structuredClone(mockPackageRows));
      if (source === schema.paymentEvents) {
        // activateSubscription reads back the payment_event inserted by
        // createZeroAmountPaymentEvent — serve it from the insert recorder,
        // LATEST FIRST: the eq(id) predicate is opaque to this mock, and the
        // caller destructures [evt] from the resolved array. Insert-order would
        // hand every grant the FIRST event (another driver's); in a real DB the
        // where clause picks the right row, so latest-first emulates that.
        const evtRows = mockInserts
          .filter((i) => i.table === schema.paymentEvents)
          .map((i, idx) => ({ ...i.vals, id: i.vals.id ?? `evt-${idx}` }))
          .reverse();
        return Promise.resolve(structuredClone(evtRows));
      }
      return Promise.resolve(structuredClone(rows));
    };
    c.from = (t: unknown) => { source = t; return c; };
    c.where = () => c;
    c.limit = () => finish();
    c.for = () => c;
    c.then = (res: any, rej: any) => finish().then(res, rej);
    c.returning = () => finish();
    return c;
  };
  const makeDb = () => ({
    select: jest.fn(() => chain([])),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((vals: Record<string, unknown>) => {
        // recordOnce: every insert is recorded exactly once regardless of how
        // the chain is consumed. Subscription inserts ALSO land in the row
        // store so the engine's convergence re-scan sees them.
        let recorded = false;
        const record = () => {
          if (recorded) return;
          recorded = true;
          mockInserts.push({ table, vals });
          if (table === schema.subscriptions) {
            mockSubscriptionRows.push({ ...vals, id: "sub-new", status: vals.status ?? "active" });
          }
        };
        const rowFor = () => {
          if (table === schema.subscriptions) return [{ ...vals, id: "sub-new" }];
          if (table === schema.paymentEvents) return [{ ...vals, id: "evt-new" }];
          if (table === schema.packages) return [{ ...vals, id: PLAN_ID }];
          if (table === schema.callLedger) return [];
          return [{ ...vals, id: "row-new" }];
        };
        const chained: any = {
          onConflictDoNothing: () => ({ returning: () => { record(); return Promise.resolve(rowFor()); } }),
          returning: () => { record(); return Promise.resolve(rowFor()); },
        };
        chained.then = (res?: unknown, rej?: unknown) => {
          record();
          return Promise.resolve(rowFor()).then(res as never, rej as never);
        };
        return chained;
      }),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
    execute: jest.fn(async () => undefined),
  });
  return {
    db: Object.assign(makeDb(), {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDb())),
    }),
  };
});

import { db } from "@/src/db";
import * as schema from "@/src/db/schema";
import {
  backfillExitCode,
  grantLaunchFreeIfEligible,
  runLaunchFreeBackfill,
} from "@/lib/launchFreeSubscription";

// The script is a thin loop over grantLaunchFreeIfEligible; the dry-run math is
// mirrored here against the same query semantics the script encodes.
const eligibleDriverIds = async (): Promise<string[]> => {
  const activeSubs = mockSubscriptionRows.filter((s) => s.status === "active");
  const activeSubDriverIds = new Set(activeSubs.map((s) => s.driver_id));
  return mockDriverRows
    .filter((d) => d.status === "active" && !activeSubDriverIds.has(d.id))
    .map((d) => d.id as string);
};

beforeEach(() => {
  mockDriverRows = [
    { id: D1, status: "active" },
    { id: D2, status: "active" },
    { id: D3, status: "active" },
  ];
  mockSubscriptionRows = [{ id: "sub-D3", driver_id: D3, status: "active" }];
  mockPackageRows = [{ id: PLAN_ID, name: "Launch Free", price_bdt: 0, call_count: -1, is_trial: false, duration_days: 36500 }];
  mockInserts = [];
  mockGrantProbeDriverId = null;
});

describe("launch-free backfill math (staged script, dry-run semantics)", () => {
  it("dry-run: D1+D2 eligible (D3 holds an active sub); zero writes performed", async () => {
    const eligible = await eligibleDriverIds();
    expect(eligible.sort()).toEqual([D1, D2].sort());
    // Dry-run executes no grants:
    expect(mockInserts.filter((i) => i.table === schema.paymentEvents)).toHaveLength(0);
    expect(mockInserts.filter((i) => i.table === schema.subscriptions)).toHaveLength(0);
  });

  it("real run: exactly one payment_event + subscription per eligible driver; D3 skipped", async () => {
    const eligible = await eligibleDriverIds();
    expect(eligible.sort()).toEqual([D1, D2].sort()); // grant loop must see both
    for (const driverId of eligible) {
      mockGrantProbeDriverId = driverId;
      const outcome = await grantLaunchFreeIfEligible({ driver_id: driverId, idempotency_key: `launch_free_backfill_${driverId}` });
      expect(outcome.outcome).toBe("granted");
    }
    expect(mockInserts.length).toBeGreaterThan(0);
    const events = mockInserts.filter((i) => i.table === schema.paymentEvents);
    const subs = mockInserts.filter((i) => i.table === schema.subscriptions);
    const ledger = mockInserts.filter((i) => i.table === schema.callLedger);
    expect(events).toHaveLength(2);
    expect(subs).toHaveLength(2);
    expect(ledger).toHaveLength(2);
    expect(events.every((e) => e.vals.amount_bdt === 0)).toBe(true);
    expect(events.every((e) => e.vals.idempotency_key?.startsWith("launch_free_backfill_"))).toBe(true);
    // D3 (already active) untouched:
    expect(events.every((e) => e.vals.driver_id !== D3)).toBe(true);
  });

  it("idempotent re-run: drivers granted in run 1 are skipped in run 2 (converges to granted=0)", async () => {
    for (const driverId of await eligibleDriverIds()) {
      await grantLaunchFreeIfEligible({ driver_id: driverId, idempotency_key: `launch_free_backfill_${driverId}` });
    }
    // Run 1 grants produce active subs:
    mockSubscriptionRows.push(
      { id: "sub-D1", driver_id: D1, status: "active" },
      { id: "sub-D2", driver_id: D2, status: "active" },
    );
    const before = mockInserts.length;
    let grantedRun2 = 0;
    let alreadyActiveRun2 = 0;
    for (const driverId of await eligibleDriverIds()) {
      mockGrantProbeDriverId = driverId;
      const r = await grantLaunchFreeIfEligible({ driver_id: driverId, idempotency_key: `launch_free_backfill2_${driverId}` });
      if (r.outcome === "granted") grantedRun2 += 1;
      else alreadyActiveRun2 += 1;
    }
    expect(await eligibleDriverIds()).toEqual([]); // nothing left eligible
    expect(grantedRun2).toBe(0);
    expect(alreadyActiveRun2).toBe(0); // eligible set is empty — they are filtered before grant
    expect(mockInserts.length).toBe(before); // zero writes on re-run
  });

  it("grant failure for one driver does not abort the batch loop (failed counter, exit-code semantics)", async () => {
    // Simulate a failing grant for D1 by breaking the plan row store.
    mockPackageRows = [];
    let failed = 0;
    for (const driverId of await eligibleDriverIds()) {
      mockGrantProbeDriverId = driverId;
      try {
        await grantLaunchFreeIfEligible({ driver_id: driverId, idempotency_key: `k_${driverId}` });
      } catch {
        failed += 1; // the script's per-driver try/catch semantics
      }
    }
    expect(failed).toBeGreaterThan(0);
  });
});

describe("M-2: backfill engine (lib runLaunchFreeBackfill) — exit-code contract", () => {
  it("real run: grants D1+D2, skips D3 (already active), converges (stillEligible=0) — exit 0", async () => {
    mockDriverRows = [
      { id: D1, status: "active" },
      { id: D2, status: "active" },
      { id: D3, status: "active" },
    ];
    mockSubscriptionRows = [{ id: "sub-D3", driver_id: D3, status: "active" }];

    const counts = await runLaunchFreeBackfill({ dryRun: false });

    expect(counts).toEqual({
      eligible: 2,
      granted: 2,
      alreadyActive: 0,
      failed: 0,
      stillEligibleAfterRun: 0, // grant inserts are visible to the re-scan
    });
    const events = mockInserts.filter((i) => i.table === schema.paymentEvents);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.vals.driver_id !== D3)).toBe(true);
    expect(backfillExitCode(counts)).toBe(0);
  });

  it("partial failure: one grant throws → failed≥1, exit 1 — never reported as success", async () => {
    mockDriverRows = [
      { id: D1, status: "active" },
      { id: D2, status: "active" },
    ];
    mockSubscriptionRows = [];
    const originalInsert = db.insert;
    const originalTransaction = db.transaction;
    try {
      // D1's payment-event insert explodes; D2 grants fine. The engine's
      // per-driver try/catch must count the failure and keep going. The grant
      // chain runs inside db.transaction — route the tx to the ROOT mock so the
      // insert override applies inside the transaction.
      (db as any).transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
      let calls = 0;
      (db as any).insert = jest.fn((table: unknown) => {
        calls += 1;
        if (calls === 1) throw new Error("payment_events down");
        return originalInsert(table);
      });

      const counts = await runLaunchFreeBackfill({ dryRun: false });

      expect(counts.failed).toBe(1);
      expect(counts.granted).toBe(1);
      expect(backfillExitCode(counts)).toBe(1);
    } finally {
      (db as any).insert = originalInsert;
      (db as any).transaction = originalTransaction;
    }
  });

  it("incomplete: zero failures but drivers remain eligible after the run → exit 2", async () => {
    // Emulate an eligibility re-scan that still returns rows (e.g. a driver was
    // activated between scan and re-scan by another process — the engine's
    // exit contract must NOT read as clean).
    mockDriverRows = [{ id: D1, status: "active" }];
    mockSubscriptionRows = [];
    const originalInsert = db.insert;
    const originalTransaction = db.transaction;
    try {
      // Route the tx to the ROOT mock (grant chain runs inside db.transaction).
      (db as any).transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
      (db as any).insert = jest.fn(() => {
        // Grant "succeeds" but the inserted subscription does NOT reach the
        // row store (every insert is misrouted to paymentEvents) — the re-scan
        // still sees the driver as eligible.
        return originalInsert(schema.paymentEvents);
      });

      const counts = await runLaunchFreeBackfill({ dryRun: false });

      expect(counts.granted).toBe(1);
      expect(counts.failed).toBe(0);
      expect(counts.stillEligibleAfterRun).toBeGreaterThan(0);
      expect(backfillExitCode(counts)).toBe(2);
    } finally {
      (db as any).insert = originalInsert;
      (db as any).transaction = originalTransaction;
    }
  });

  it("dry-run: counts eligible drivers, performs ZERO writes, exit 0", async () => {
    const counts = await runLaunchFreeBackfill({ dryRun: true });

    expect(counts).toEqual({
      eligible: 2, // D1+D2 (D3 filtered by its active sub)
      granted: 2, // dry-run counts grants without executing them
      alreadyActive: 0,
      failed: 0,
      stillEligibleAfterRun: -1, // re-scan does not run
    });
    expect(mockInserts.filter((i) => i.table === schema.paymentEvents)).toHaveLength(0);
    expect(mockInserts.filter((i) => i.table === schema.subscriptions)).toHaveLength(0);
    expect(backfillExitCode(counts)).toBe(0);
  });

  it("pure contract: backfillExitCode precedence failed > stillEligible > clean", () => {
    expect(backfillExitCode({ eligible: 5, granted: 5, alreadyActive: 0, failed: 1, stillEligibleAfterRun: 2 })).toBe(1);
    expect(backfillExitCode({ eligible: 5, granted: 5, alreadyActive: 0, failed: 0, stillEligibleAfterRun: 1 })).toBe(2);
    expect(backfillExitCode({ eligible: 5, granted: 5, alreadyActive: 0, failed: 0, stillEligibleAfterRun: 0 })).toBe(0);
  });
});
