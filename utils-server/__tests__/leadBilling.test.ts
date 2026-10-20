/**
 * Lead Billing invariants (Phase D — debit-on-offer):
 *  - exactly-once per (ride_id, driver_id) via the dispatch_offers conflict
 *    path AND the call_ledger 23505 defense-in-depth path
 *  - skip on: no active subscription, daily cap reached, zero balance
 *    (non-unlimited); -1 unlimited sentinel passes
 *  - subscription counters updated (calls_remaining−1, daily_calls_used+1,
 *    total_deductions+1)
 *  - atomicity: offer row + deduction commit in ONE transaction — a mid-tx
 *    failure rolls back BOTH (snapshot/rollback transaction mock)
 *
 * The DB is mocked; leadBilling.ts imports `../src/db` which resolves to the
 * root src/db module, so jest.mock('../../src/db') replaces it.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { transaction: jest.fn() },
}));

import { db } from "../../src/db";
import {
  subscriptions,
  packages,
  callLedger,
  dispatchOffers,
  drivers,
  rides,
  platformConfig,
} from "../../src/db/schema";
import { debitLeadForOffer, debitLeadForOfferTx } from "../leadBilling";

type Row = Record<string, unknown>;

interface FakeState {
  subscriptions: Row[];
  packages: Row[];
  callLedger: Row[];
  dispatchOffers: Row[];
  drivers: Row[];
  rides: Row[];
  platformConfig: Row[];
}

interface TxLike {
  select: () => { from: (table: unknown) => unknown };
  insert: (table: unknown) => { values: (v: Row) => unknown };
  update: (table: unknown) => { set: (s: Row) => { where: () => Promise<unknown> } };
}

const ACTIVE_DRIVER: Row = {
  id: "driver-1",
  status: "active",
  is_online: true,
  gender: "male",
  gender_verified: false,
  women_only_enabled: false,
  vehicle_type: "bike_basic",
};

const MIXED_RIDE: Row = { id: "ride-1", women_only: false, vehicle_type: "bike_basic" };

function makePgError(code: string): Error & { code: string } {
  const err = new Error("duplicate key value violates unique constraint") as Error & { code: string };
  err.code = code;
  return err;
}

function buildDbMock(initial: Partial<FakeState>): {
  state: FakeState;
  updates: { table: unknown; set: Row }[];
  tx: TxLike;
} {
  const state: FakeState = {
    subscriptions: initial.subscriptions ?? [],
    packages: initial.packages ?? [],
    callLedger: initial.callLedger ?? [],
    dispatchOffers: initial.dispatchOffers ?? [],
    // F-9.1: default seed — an ACTIVE, ONLINE driver row, matching the
    // pre-guard world where only the pool filter (status='active') existed.
    // Tests that exercise the status guard override or clear this.
    // S8: default driver carries the expanded projection fields; the
    // default ride is a mixed bike_basic ride; platformConfig seeds the
    // kill switch OFF (legacy behavior unless a test opts into ON).
    drivers: initial.drivers ?? [{ ...ACTIVE_DRIVER }],
    rides: initial.rides ?? [{ ...MIXED_RIDE }],
    platformConfig: initial.platformConfig ?? [
      { key: "women_only_rides_enabled", value: "false" },
    ],
  };
  const updates: { table: unknown; set: Row }[] = [];

  const rowsFor = (table: unknown): Row[] => {
    if (table === subscriptions) return state.subscriptions;
    if (table === packages) return state.packages;
    if (table === callLedger) return state.callLedger;
    if (table === dispatchOffers) return state.dispatchOffers;
    if (table === drivers) return state.drivers;
    if (table === rides) return state.rides;
    if (table === platformConfig) return state.platformConfig;
    return [];
  };

  const makeSelectChain = (table: unknown, rows: Row[]) => {
    // The real query filters status='active' (and expiry) in SQL; the mock
    // applies the active-status predicate for subscriptions so expired
    // subscription rows are invisible to the resolver, like Postgres would be.
    const visible = table === subscriptions ? rows.filter((r) => r.status === "active") : rows;
    const chain: Record<string, unknown> = {
      where: () => chain,
      orderBy: () => chain,
      for: () => chain,
      limit: async (n: number) => visible.slice(0, n),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(visible).then(resolve, reject),
    };
    return chain;
  };

  const makeInsertApi = (table: unknown, values: Row): Record<string, unknown> => ({
    // dispatchOffers insert: onConflictDoNothing().returning() — zero rows on
    // (ride_id, driver_id) conflict, the inserted row's id otherwise.
    onConflictDoNothing: () => ({
      returning: async (): Row[] => {
        if (table !== dispatchOffers) return [];
        const conflict = state.dispatchOffers.some(
          (r) => r.ride_id === values.ride_id && r.driver_id === values.driver_id,
        );
        if (conflict) return [];
        state.dispatchOffers.push({ id: `offer-${state.dispatchOffers.length}`, ...values });
        return [{ id: `offer-${state.dispatchOffers.length - 1}` }];
      },
    }),
    // callLedger insert: awaited directly — enforces the partial unique index
    // (ride_id, driver_id) WHERE event_type='deduction' via a 23505 throw.
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      if (table !== callLedger) {
        Promise.resolve([]).then(resolve, reject);
        return;
      }
      if (values.event_type === "deduction") {
        const dup = state.callLedger.some(
          (r) =>
            r.ride_id === values.ride_id &&
            r.driver_id === values.driver_id &&
            r.event_type === "deduction",
        );
        if (dup) {
          Promise.reject(makePgError("23505")).then(resolve, reject);
          return;
        }
      }
      state.callLedger.push(values);
      Promise.resolve([]).then(resolve, reject);
    },
  });

  const tx: TxLike = {
    select: () => ({
      from: (table: unknown) => makeSelectChain(table, rowsFor(table)),
    }),
    insert: (table: unknown) => ({
      values: (v: Row) => makeInsertApi(table, v),
    }),
    update: (table: unknown) => ({
      set: (setValues: Row) => ({
        where: async () => {
          updates.push({ table, set: setValues });
          const rows = rowsFor(table);
          for (let i = 0; i < rows.length; i++) {
            rows[i] = { ...rows[i], ...setValues };
          }
          return {};
        },
      }),
    }),
  };

  // Transaction with real commit/rollback semantics: snapshot before, restore on throw.
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: TxLike) => unknown) => {
      const snapshot = JSON.parse(JSON.stringify(state)) as FakeState;
      try {
        return await cb(tx);
      } catch (e) {
        state.subscriptions = snapshot.subscriptions;
        state.packages = snapshot.packages;
        state.callLedger = snapshot.callLedger;
        state.dispatchOffers = snapshot.dispatchOffers;
        state.drivers = snapshot.drivers;
        state.rides = snapshot.rides;
        state.platformConfig = snapshot.platformConfig;
        throw e;
      }
    },
  );

  return { state, updates, tx };
}

const ACTIVE_SUB: Row = {
  id: "sub-1",
  driver_id: "driver-1",
  package_id: "pkg-1",
  status: "active",
  calls_remaining: 5,
  daily_calls_used: 0,
  total_deductions: 2,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
};

const PACKAGE: Row = { id: "pkg-1", daily_cap: 50 };

describe("debitLeadForOfferTx — happy path", () => {
  test("bills 1 lead: offer row + deduction + counter updates in one tx", async () => {
    const { state, updates } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
    });

    const res = await debitLeadForOfferTx({
      rideId: "ride-1",
      driverId: "driver-1",
      chainIndex: 3,
      womenOnlyFeatureEnabled: false,
    });

    expect(res).toEqual({ billed: true, balanceAfter: 4 });
    expect(state.dispatchOffers).toHaveLength(1);
    expect(state.dispatchOffers[0]).toMatchObject({
      ride_id: "ride-1",
      driver_id: "driver-1",
      batch_index: 3,
      outcome: "delivered",
    });
    expect(state.callLedger).toHaveLength(1);
    expect(state.callLedger[0]).toMatchObject({
      subscription_id: "sub-1",
      driver_id: "driver-1",
      ride_id: "ride-1",
      event_type: "deduction",
      delta: -1,
      balance_after: 4,
      reason: "offer_sent",
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({
      calls_remaining: 4,
      daily_calls_used: 1,
      total_deductions: 3,
    });
    expect(state.subscriptions[0].calls_remaining).toBe(4);
    expect(state.subscriptions[0].daily_calls_used).toBe(1);
    expect(state.subscriptions[0].total_deductions).toBe(3);
  });

  test("unlimited (-1) sentinel passes: balance stays -1, counters move", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB, calls_remaining: -1 }],
      packages: [{ ...PACKAGE }],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res).toEqual({ billed: true, balanceAfter: -1 });
    expect(state.callLedger[0]).toMatchObject({ balance_after: -1, delta: -1 });
    expect(state.subscriptions[0].calls_remaining).toBe(-1);
    expect(state.subscriptions[0].daily_calls_used).toBe(1);
    expect(state.subscriptions[0].total_deductions).toBe(3);
  });
});

describe("debitLeadForOfferTx — skip paths (no writes)", () => {
  test("no active subscription → billed=false, zero writes", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB, status: "expired" }],
      packages: [{ ...PACKAGE }],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res.billed).toBe(false);
    expect(res.balanceAfter).toBeNull();
    expect(state.callLedger).toHaveLength(0);
    expect(state.dispatchOffers).toHaveLength(0);
  });

  test("daily cap reached → billed=false, zero writes", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB, daily_calls_used: 50 }],
      packages: [{ ...PACKAGE, daily_cap: 50 }],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res.billed).toBe(false);
    expect(state.callLedger).toHaveLength(0);
    expect(state.dispatchOffers).toHaveLength(0);
  });

  test("zero balance (non-unlimited) → billed=false, zero writes", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB, calls_remaining: 0 }],
      packages: [{ ...PACKAGE }],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res.billed).toBe(false);
    expect(state.callLedger).toHaveLength(0);
    expect(state.dispatchOffers).toHaveLength(0);
  });
});

describe("debitLeadForOfferTx — exactly-once per (ride_id, driver_id)", () => {
  test("offer-row conflict → billed=false, no ledger insert, no counter update", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      dispatchOffers: [
        { id: "offer-existing", ride_id: "ride-1", driver_id: "driver-1", outcome: "delivered" },
      ],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res.billed).toBe(false);
    expect(state.callLedger).toHaveLength(0);
    expect(state.dispatchOffers).toHaveLength(1); // only the pre-existing row
    expect(state.subscriptions[0].calls_remaining).toBe(5);
  });

  test("call_ledger 23505 (defense-in-depth) → full rollback: offer row does NOT persist", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      callLedger: [
        {
          subscription_id: "sub-1",
          driver_id: "driver-1",
          ride_id: "ride-1",
          event_type: "deduction",
          delta: -1,
          balance_after: 4,
        },
      ],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res.billed).toBe(false);
    // Atomicity: the offer row inserted inside the tx was rolled back with
    // the failed deduction insert — neither row was duplicated.
    expect(state.dispatchOffers).toHaveLength(0);
    expect(state.callLedger).toHaveLength(1); // only the pre-existing deduction
    expect(state.subscriptions[0].calls_remaining).toBe(5);
  });
});

describe("debitLeadForOfferTx — atomicity (invariant 10)", () => {
  test("mid-tx failure after the offer insert → NEITHER row persists", async () => {
    const mock = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
    });

    // Replace the tx with one whose call_ledger insert fails with a
    // NON-23505 error (real outage mid-transaction): debitLeadForOffer
    // rethrows, the wrapper propagates, the snapshot rollback runs.
    const failingTx: TxLike = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            // F-9.1: the drivers row read (step 4b) + the subscription and
            // package reads all flow through here. S8: the rides read
            // (step 4b ride row) resolves to the mocked rides table so the
            // fail-closed ride check passes and the mid-tx failure below
            // still fires at the call_ledger insert.
            const rows =
              table === packages
                ? mock.state.packages
                : table === drivers
                  ? mock.state.drivers
                  : table === rides
                    ? mock.state.rides
                    : mock.state.subscriptions;
            const chain: Record<string, unknown> = {
              orderBy: () => chain,
              for: () => chain,
              limit: async (n: number) => rows.slice(0, n),
              then: (res: (v: unknown) => void) => res(rows),
            };
            return chain;
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => (table === dispatchOffers ? [{ id: "x" }] : []),
          }),
          then: (_res: unknown, rej: (e: unknown) => void) => {
            Promise.reject(new Error("connection reset mid-tx")).then(undefined, rej);
          },
        }),
      }),
      update: () => ({ set: () => ({ where: async () => ({}) }) }),
    };
    (db.transaction as jest.Mock).mockImplementation(
      async (cb: (t: TxLike) => unknown) => {
        const snapshot = JSON.parse(JSON.stringify(mock.state)) as FakeState;
        try {
          return await cb(failingTx);
        } catch (e) {
          mock.state.subscriptions = snapshot.subscriptions;
          mock.state.packages = snapshot.packages;
          mock.state.callLedger = snapshot.callLedger;
          mock.state.dispatchOffers = snapshot.dispatchOffers;
          mock.state.drivers = snapshot.drivers;
          mock.state.rides = snapshot.rides;
          mock.state.platformConfig = snapshot.platformConfig;
          throw e;
        }
      },
    );

    await expect(
      debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false }),
    ).rejects.toThrow("connection reset mid-tx");

    expect(mock.state.dispatchOffers).toHaveLength(0);
    expect(mock.state.callLedger).toHaveLength(0);
    expect(mock.state.subscriptions[0].calls_remaining).toBe(5);

    // Rebuild the standard mock for any subsequent tests in this file
    buildDbMock({ subscriptions: [{ ...ACTIVE_SUB }], packages: [{ ...PACKAGE }] });
  });
});

describe("debitLeadForOffer — caller-owned tx passthrough", () => {
  test("can be invoked with an externally-provided tx", async () => {
    const mock = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      rides: [{ ...MIXED_RIDE, id: "ride-9" }],
    });
    const res = await debitLeadForOffer(mock.tx, {
      rideId: "ride-9",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: false,
    });
    expect(res.billed).toBe(true);
    expect(res.balanceAfter).toBe(4);
  });
});

describe("debitLeadForOfferTx — account-status guard (F-9.1)", () => {
  test("suspended-after-pool-build driver is NOT debited and NOT offered", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      drivers: [{ ...ACTIVE_DRIVER, status: "suspended" }],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(state.dispatchOffers).toHaveLength(0);
    expect(state.callLedger).toHaveLength(0);
    expect(state.subscriptions[0].calls_remaining).toBe(5); // untouched
  });

  test("driver gone offline since pool build is skipped with zero writes", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      drivers: [{ ...ACTIVE_DRIVER, is_online: false }],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(state.dispatchOffers).toHaveLength(0);
    expect(state.callLedger).toHaveLength(0);
  });

  test("missing drivers row is skipped (defensive — driver deleted mid-chain)", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      drivers: [],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(state.dispatchOffers).toHaveLength(0);
  });

  test("active+online driver passes the guard and the debit proceeds (guard ordering: after balance guard)", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      drivers: [{ ...ACTIVE_DRIVER }],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    expect(res).toEqual({ billed: true, balanceAfter: 4 });
    expect(state.dispatchOffers).toHaveLength(1);
    expect(state.callLedger).toHaveLength(1);
  });
});

// ── S6 regression — DRIZZLE-WRAPPED 23505 (cause-chain, the real-DB shape) ──
// Mirrors the S4 idempotency fix: drizzle wraps driver errors in
// DrizzleQueryError, so the 23505 lives on `cause` and a bare `e.code ===
// '23505'` never matches — the graceful skip degraded to a thrown error
// (tx still rolled back, no double-billing, but the dispatch chain aborted).
describe("debitLeadForOfferTx — drizzle-wrapped 23505 (S6 regression)", () => {
  test("wrapped call_ledger 23505 (cause.code) rolls back and reports billed=false instead of throwing", async () => {
    const mock = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
    });

    // Real-DB shape: error carries `cause`, not `code` (depth-2 chain like
    // DrizzleQueryError → driver error).
    const wrapped = Object.assign(new Error("insert failed"), {
      cause: Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    });

    const wrappedTx: TxLike = {
      select: mock.tx.select,
      update: mock.tx.update,
      insert: (table: unknown) => {
        if (table !== callLedger) return mock.tx.insert(table);
        return {
          values: (_v: Row) => ({
            then: (_res: unknown, rej: (e: unknown) => void) => {
              Promise.reject(wrapped).then(undefined, rej);
            },
          }),
        };
      },
    };
    (db.transaction as jest.Mock).mockImplementation(
      async (cb: (t: TxLike) => unknown) => {
        const snapshot = JSON.parse(JSON.stringify(mock.state)) as FakeState;
        try {
          return await cb(wrappedTx);
        } catch (e) {
          mock.state.subscriptions = snapshot.subscriptions;
          mock.state.packages = snapshot.packages;
          mock.state.callLedger = snapshot.callLedger;
          mock.state.dispatchOffers = snapshot.dispatchOffers;
          mock.state.drivers = snapshot.drivers;
          mock.state.rides = snapshot.rides;
          mock.state.platformConfig = snapshot.platformConfig;
          throw e;
        }
      },
    );

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1", womenOnlyFeatureEnabled: false });

    // Pre-fix: SkipBillingError was never thrown for the wrapped error and
    // this call REJECTED. Post-fix: recognized → rollback-and-skip.
    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(mock.state.dispatchOffers).toHaveLength(0); // offer row rolled back
    expect(mock.state.callLedger).toHaveLength(0);
    expect(mock.state.subscriptions[0].calls_remaining).toBe(5); // untouched
  });
});

// ── S8 step-4b mid-chain drift guard + kill-switch fault pairs ─────────────
// Every offered driver is billed regardless of outcome (ruling 8), but the
// debit itself is skipped — with zero writes — when the driver drifted out
// of eligibility between pool build and offer time.
describe("debitLeadForOfferTx — S8 step 4b (women-only drift guard)", () => {
  const FEMALE_VERIFIED: Row = {
    ...ACTIVE_DRIVER,
    gender: "female",
    gender_verified: true,
  };
  const WOMEN_ONLY_RIDE: Row = { id: "ride-wo", women_only: true, vehicle_type: "bike_basic" };

  function base(over: Partial<FakeState>) {
    return buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      ...over,
    });
  }

  test("women-only ride + verified female driver → billed (kill switch ON)", async () => {
    const { state } = base({
      drivers: [FEMALE_VERIFIED],
      rides: [WOMEN_ONLY_RIDE],
    });
    const res = await debitLeadForOfferTx({
      rideId: "ride-wo",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: true,
    });
    expect(res).toEqual({ billed: true, balanceAfter: 4 });
    expect(state.dispatchOffers).toHaveLength(1);
    expect(state.callLedger).toHaveLength(1);
  });

  test("women-only ride + UNVERIFIED female driver → skipped, zero writes", async () => {
    const { state } = base({
      drivers: [{ ...FEMALE_VERIFIED, gender_verified: false }],
      rides: [WOMEN_ONLY_RIDE],
    });
    const res = await debitLeadForOfferTx({
      rideId: "ride-wo",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: true,
    });
    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(state.dispatchOffers).toHaveLength(0);
    expect(state.callLedger).toHaveLength(0);
  });

  test("women-only ride + male driver → skipped, zero writes", async () => {
    const { state } = base({ rides: [WOMEN_ONLY_RIDE] });
    const res = await debitLeadForOfferTx({
      rideId: "ride-wo",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: true,
    });
    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(state.dispatchOffers).toHaveLength(0);
    expect(state.callLedger).toHaveLength(0);
  });

  test("mixed ride + armed toggle + kill switch ON → skipped (self-exclusion)", async () => {
    const { state } = base({
      drivers: [{ ...FEMALE_VERIFIED, women_only_enabled: true }],
    });
    const res = await debitLeadForOfferTx({
      rideId: "ride-1",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: true,
    });
    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(state.dispatchOffers).toHaveLength(0);
    expect(state.callLedger).toHaveLength(0);
  });

  test("mixed ride + armed toggle + kill switch OFF → billed (toggle neutralized)", async () => {
    const { state } = base({
      drivers: [{ ...FEMALE_VERIFIED, women_only_enabled: true }],
    });
    const res = await debitLeadForOfferTx({
      rideId: "ride-1",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: false,
    });
    expect(res).toEqual({ billed: true, balanceAfter: 4 });
    expect(state.dispatchOffers).toHaveLength(1);
  });

  test("missing ride row → skipped, zero writes (fail closed)", async () => {
    const { state } = base({ rides: [] });
    const res = await debitLeadForOfferTx({
      rideId: "ride-1",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: false,
    });
    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(state.dispatchOffers).toHaveLength(0);
    expect(state.callLedger).toHaveLength(0);
  });

  test("mid-chain vehicle switch (driver scooter vs ride bike_basic) → skipped", async () => {
    const { state } = base({
      drivers: [{ ...FEMALE_VERIFIED, vehicle_type: "scooter" }],
    });
    const res = await debitLeadForOfferTx({
      rideId: "ride-1",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: false,
    });
    expect(res).toEqual({ billed: false, balanceAfter: null });
    expect(state.dispatchOffers).toHaveLength(0);
    expect(state.callLedger).toHaveLength(0);
  });

  test("R11-C1: women_only=true on a CAR ride fails open → billed (never restricts the pool)", async () => {
    const { state } = base({
      rides: [{ id: "ride-car", women_only: true, vehicle_type: "car_economy" }],
      drivers: [{ ...ACTIVE_DRIVER, vehicle_type: "car_economy" }],
    });
    const res = await debitLeadForOfferTx({
      rideId: "ride-car",
      driverId: "driver-1",
      womenOnlyFeatureEnabled: true,
    });
    expect(res).toEqual({ billed: true, balanceAfter: 4 });
  });
});
