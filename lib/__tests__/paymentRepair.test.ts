/**
 * Purpose-dispatched payment repair (audit Z-2/Z-3): the compensation worker
 * used to route EVERY queue row through activateSubscription — which throws
 * for anything without driver_id + package_id, so paid wallet topups and
 * rider passes could never be repaired. repairPaymentEvent must dispatch by
 * purpose:
 *  - wallet_topup  → creditWalletTopup (the credit transaction, not the sub)
 *  - rider_pass    → activateRiderPass
 *  - driver_package → activateSubscription
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../activateSubscription", () => ({
  activateSubscription: jest.fn(),
}));
jest.mock("../accounting", () => ({
  recordWalletTopup: jest.fn(),
  recordRiderPassPurchase: jest.fn(),
  recordSubscriptionSale: jest.fn(),
}));

import { db } from "../../src/db";
import {
  paymentEvents,
  users,
  riderPasses,
} from "../../src/db/schema";
import { activateSubscription } from "../activateSubscription";
import { recordWalletTopup, recordRiderPassPurchase } from "../accounting";
import { repairPaymentEvent } from "../paymentRepair";

type Row = Record<string, unknown>;

interface SelectChain {
  for: () => SelectChain;
  limit: () => SelectChain;
  then: (resolve: (v: unknown) => void) => void;
}

const BY_TABLE = new Map<unknown, Row[]>();

function baseEvent(overrides: Row = {}): Row {
  return {
    id: "evt-1",
    amount_bdt: 50000,
    status: "callback_pending",
    purpose: "driver_package",
    user_id: "user-1",
    driver_id: "driver-1",
    pass_id: null,
    ride_id: null,
    subscription_id: null,
    package_id: "pkg-1",
    ...overrides,
  };
}

beforeEach(() => {
  BY_TABLE.clear();
  jest.clearAllMocks();

  const selectFrom = (table: unknown) => {
    const rows = () => BY_TABLE.get(table) ?? [];
    return {
      where: jest.fn(() => {
        // Chain supports .for("update") and .limit(1) in either order; the
        // awaited result is the (single) row set.
        const chain: SelectChain = {
          for: jest.fn(() => chain),
          limit: jest.fn(() => chain),
          then: (resolve: (v: unknown) => void) => resolve(rows().slice(0, 1)),
        };
        return chain;
      }),
    };
  };

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn(selectFrom),
  }));

  const tx = {
    select: jest.fn(() => ({ from: jest.fn(selectFrom) })),
    insert: jest.fn(() => ({
      values: jest.fn((values: Row) => ({
        returning: jest.fn(async () => [values]),
        onConflictDoNothing: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn(async () => ({})) })),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: typeof tx) => unknown) => cb(tx),
  );
});

describe("repairPaymentEvent — purpose dispatch", () => {
  test("wallet_topup is repaired by the credit transaction, NOT activateSubscription", async () => {
    BY_TABLE.set(paymentEvents, [
      baseEvent({ purpose: "wallet_topup", driver_id: null }),
    ]);
    BY_TABLE.set(users, [{ id: "user-1", rider_wallet_balance_bdt: 0 }]);

    await repairPaymentEvent("evt-1");

    expect(activateSubscription).not.toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordWalletTopup).toHaveBeenCalledWith(
      expect.objectContaining({ paymentEventId: "evt-1", amountPaisa: 50000 }),
    );
  });

  test("rider_pass is repaired by pass activation, NOT activateSubscription", async () => {
    BY_TABLE.set(paymentEvents, [
      baseEvent({ purpose: "rider_pass", driver_id: null, pass_id: "pass-1" }),
    ]);
    BY_TABLE.set(riderPasses, [{ id: "pass-1", validity_days: 30 }]);

    await repairPaymentEvent("evt-1");

    expect(activateSubscription).not.toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordRiderPassPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ paymentEventId: "evt-1" }),
    );
  });

  test("driver_package goes through activateSubscription", async () => {
    BY_TABLE.set(paymentEvents, [baseEvent({ purpose: "driver_package" })]);
    (activateSubscription as jest.Mock).mockResolvedValue({
      subscriptionId: "sub-9",
    });

    await repairPaymentEvent("evt-1");

    expect(activateSubscription).toHaveBeenCalledWith("evt-1");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("an already-paid event is a no-op", async () => {
    BY_TABLE.set(paymentEvents, [baseEvent({ status: "paid" })]);

    await repairPaymentEvent("evt-1");

    expect(activateSubscription).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("an unknown event throws — the worker backs off and eventually fails the row", async () => {
    BY_TABLE.set(paymentEvents, []);

    await expect(repairPaymentEvent("evt-1")).rejects.toThrow(
      "payment_event not found",
    );
  });
});
