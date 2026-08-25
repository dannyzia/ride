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
} from "../../src/db/schema";
import { debitLeadForOffer, debitLeadForOfferTx } from "../leadBilling";

type Row = Record<string, unknown>;

interface FakeState {
  subscriptions: Row[];
  packages: Row[];
  callLedger: Row[];
  dispatchOffers: Row[];
}

interface TxLike {
  select: () => { from: (table: unknown) => unknown };
  insert: (table: unknown) => { values: (v: Row) => unknown };
  update: (table: unknown) => { set: (s: Row) => { where: () => Promise<unknown> } };
}

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
  };
  const updates: { table: unknown; set: Row }[] = [];

  const rowsFor = (table: unknown): Row[] => {
    if (table === subscriptions) return state.subscriptions;
    if (table === packages) return state.packages;
    if (table === callLedger) return state.callLedger;
    if (table === dispatchOffers) return state.dispatchOffers;
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

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1" });

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

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1" });

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

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1" });

    expect(res.billed).toBe(false);
    expect(state.callLedger).toHaveLength(0);
    expect(state.dispatchOffers).toHaveLength(0);
  });

  test("zero balance (non-unlimited) → billed=false, zero writes", async () => {
    const { state } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB, calls_remaining: 0 }],
      packages: [{ ...PACKAGE }],
    });

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1" });

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

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1" });

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

    const res = await debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1" });

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
            const rows =
              table === packages ? mock.state.packages : mock.state.subscriptions;
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
          throw e;
        }
      },
    );

    await expect(
      debitLeadForOfferTx({ rideId: "ride-1", driverId: "driver-1" }),
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
    });
    const res = await debitLeadForOffer(mock.tx, { rideId: "ride-9", driverId: "driver-1" });
    expect(res.billed).toBe(true);
    expect(res.balanceAfter).toBe(4);
  });
});
