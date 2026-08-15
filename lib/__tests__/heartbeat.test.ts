/**
 * Money invariants for the call-deduction/refund path (AGENTS.md Dispatch
 * invariants + AC-7). The DB is mocked; heartbeat.ts imports `../src/db`
 * which resolves to the root src/db module, so jest.mock('../../src/db')
 * replaces it.
 *
 * Covered invariants:
 *  - single deduction per (ride_id, driver_id) — the partial unique index
 *    (23505) turns a duplicate insert into a no-op
 *  - refund idempotency — a second refund for the same (ride, driver) is a no-op
 *  - unlimited (-1) subscriptions stay at -1 after a refund (never restored to 0)
 *  - inactive subscriptions are never deducted
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
import { recordCallDeduction, recordCallRefund } from "../../utils-server/heartbeat";

type Row = Record<string, unknown>;

interface FakeState {
  subscriptions: Row[];
  packages: Row[];
  callLedger: Row[];
  dispatchOffers: Row[];
}

function buildDbMock(initial: Partial<FakeState>) {
  const state: FakeState = {
    subscriptions: initial.subscriptions ?? [],
    packages: initial.packages ?? [],
    callLedger: initial.callLedger ?? [],
    dispatchOffers: initial.dispatchOffers ?? [],
  };

  const inserted: Row[] = [];

  const rowsFor = (table: unknown): Row[] => {
    if (table === subscriptions) return state.subscriptions;
    if (table === packages) return state.packages;
    if (table === callLedger) return state.callLedger;
    if (table === dispatchOffers) return state.dispatchOffers;
    return [];
  };

  const tx = {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => ({
        where: jest.fn(() => {
          const rows = rowsFor(table);
          // Supports .for("update") now used by recordCallDeduction/Refund
          // (the subscription read is locked): where → for → (then | limit).
          const chain: any = {
            for: jest.fn(() => chain),
            limit: jest.fn(async (n: number) => rows.slice(0, n)),
            then: (resolve: (v: unknown) => void) => resolve(rows),
          };
          return chain;
        }),
      })),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn(async (values: Row) => {
        if (table === callLedger) {
          // Partial unique index: (ride_id, driver_id) WHERE event_type='deduction'
          if (values.event_type === "deduction") {
            const dup = state.callLedger.some(
              (r) =>
                r.ride_id === values.ride_id &&
                r.driver_id === values.driver_id &&
                r.event_type === "deduction",
            );
            if (dup) {
              const err = new Error(
                "duplicate key value violates unique constraint",
              ) as Error & { code?: string };
              err.code = "23505";
              throw err;
            }
          }
          state.callLedger.push(values);
          inserted.push(values);
        }
        return {
          onConflictDoNothing: jest.fn(),
          returning: jest.fn(),
        };
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(async () => ({})),
      })),
    })),
  };

  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: typeof tx) => unknown) => cb(tx),
  );

  return { state, inserted, tx };
}

const ACTIVE_SUB: Row = {
  id: "sub-1",
  driver_id: "driver-1",
  status: "active",
  calls_remaining: 5,
  daily_calls_used: 0,
  package_id: "pkg-1",
};

const PACKAGE: Row = { id: "pkg-1", daily_cap: 50 };

describe("recordCallDeduction — single deduction per (ride_id, driver_id)", () => {
  test("first call deducts exactly one call and stamps the delivered offer", async () => {
    const { inserted, tx } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
    });

    const res = await recordCallDeduction({
      driverId: "driver-1",
      subscriptionId: "sub-1",
      rideId: "ride-1",
      confirmedAt: new Date(),
    });

    expect(res.deducted).toBe(true);
    const deductions = inserted.filter((r) => r.event_type === "deduction");
    expect(deductions).toHaveLength(1);
    expect(deductions[0]).toMatchObject({
      ride_id: "ride-1",
      driver_id: "driver-1",
      delta: -1,
      balance_after: 4,
    });
    // fetch_confirmed_at is stamped on the matching delivered offer row
    expect(tx.update).toHaveBeenCalled();
  });

  test("duplicate deduction for the same (ride, driver) is a no-op (unique index)", async () => {
    const { inserted } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      packages: [{ ...PACKAGE }],
      callLedger: [
        {
          subscription_id: "sub-1",
          driver_id: "driver-1",
          ride_id: "ride-1",
          event_type: "deduction",
          delta: -1,
        },
      ],
    });

    const res = await recordCallDeduction({
      driverId: "driver-1",
      subscriptionId: "sub-1",
      rideId: "ride-1",
      confirmedAt: new Date(),
    });

    expect(res.deducted).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  test("inactive subscription is never deducted", async () => {
    const { inserted } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB, status: "expired" }],
      packages: [{ ...PACKAGE }],
    });

    const res = await recordCallDeduction({
      driverId: "driver-1",
      subscriptionId: "sub-1",
      rideId: "ride-1",
      confirmedAt: new Date(),
    });

    expect(res.deducted).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe("recordCallRefund — AC-7 idempotent refunds", () => {
  test("creates a refund row and restores the balance", async () => {
    const { inserted } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB, calls_remaining: 4 }],
    });

    const res = await recordCallRefund({
      driverId: "driver-1",
      subscriptionId: "sub-1",
      rideId: "ride-1",
    });

    expect(res.refunded).toBe(true);
    const refunds = inserted.filter((r) => r.event_type === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      ride_id: "ride-1",
      driver_id: "driver-1",
      delta: 1,
      balance_after: 5,
    });
  });

  test("a second refund for the same (ride, driver) is a no-op", async () => {
    const { inserted } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB }],
      callLedger: [
        {
          subscription_id: "sub-1",
          driver_id: "driver-1",
          ride_id: "ride-1",
          event_type: "refund",
          delta: 1,
        },
      ],
    });

    const res = await recordCallRefund({
      driverId: "driver-1",
      subscriptionId: "sub-1",
      rideId: "ride-1",
    });

    expect(res.refunded).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  test("unlimited (-1) subscription stays at -1 after refund (never restored to 0)", async () => {
    const { inserted } = buildDbMock({
      subscriptions: [{ ...ACTIVE_SUB, calls_remaining: -1 }],
    });

    const res = await recordCallRefund({
      driverId: "driver-1",
      subscriptionId: "sub-1",
      rideId: "ride-1",
    });

    expect(res.refunded).toBe(true);
    const refunds = inserted.filter((r) => r.event_type === "refund");
    expect(refunds[0].balance_after).toBe(-1);
  });
});
