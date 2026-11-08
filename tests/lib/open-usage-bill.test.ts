/**
 * Batch-2 Item 8 — openUsageBill (the usage-time accrual writer).
 *
 * Pinned:
 *   - one row per producer event, kind='usage', status='open', source keyed;
 *   - the DB unique index makes a retried transition a null no-op;
 *   - a non-positive / non-integer amount is a programming error, not data.
 * Subscription bills are untouched: this writer never sets subscription_id and
 * never takes the purchase lock.
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/idempotency", () => ({ driverErrorCode: () => null }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { openUsageBill, voidUsageBillForSource } from "@/lib/billsLedger";

const SHOP_ID = "55555555-5555-4555-8555-555555555555";
const ORDER_ID = "66666666-6666-4666-8666-666666666666";

type Row = Record<string, unknown>;

function makeTx(returning: Row[] = [{ id: "bill-1" }]) {
  const values: Row[] = [];
  const updated: Row[] = [];
  const returningSpy = jest.fn(async () => returning);
  const tx = {
    insert: jest.fn(() => ({
      values: (vals: Row) => {
        values.push(vals);
        return { onConflictDoNothing: () => ({ returning: returningSpy }) };
      },
    })),
    update: jest.fn(() => ({
      set: (vals: Row) => {
        updated.push(vals);
        return { where: () => ({ returning: returningSpy }) };
      },
    })),
  };
  return { tx, values, updated, returningSpy };
}

describe("openUsageBill", () => {
  test("inserts one open usage bill keyed by the source order", async () => {
    const { tx, values, returningSpy } = makeTx();

    const result = await openUsageBill(tx as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 800,
      sourceOrderId: ORDER_ID,
    });

    expect(result).toEqual({ id: "bill-1" });
    expect(values[0]).toMatchObject({
      operator_id: SHOP_ID,
      operator_role: "shop",
      kind: "usage",
      status: "open",
      amount_bdt: 800,
      source_order_id: ORDER_ID,
      subscription_id: null,
    });
    expect(returningSpy).toHaveBeenCalled();
  });

  test("a duplicate source is a null no-op (unique index backstop)", async () => {
    const { tx } = makeTx([]);

    expect(
      await openUsageBill(tx as never, {
        operatorRole: "shop",
        operatorId: SHOP_ID,
        amountBdt: 800,
        sourceOrderId: ORDER_ID,
      }),
    ).toBeNull();
  });

  test("voidUsageBillForSource retires an open usage bill for the event", async () => {
    const { tx, updated } = makeTx();

    expect(
      await voidUsageBillForSource(tx as never, { operatorRole: "shop", sourceOrderId: ORDER_ID }),
    ).toEqual({ billId: "bill-1" });
    expect(updated[0]).toMatchObject({ status: "void" });
  });

  test("voidUsageBillForSource is a no-op when no open usage bill matches", async () => {
    const { tx } = makeTx([]);

    expect(
      await voidUsageBillForSource(tx as never, { operatorRole: "shop", sourceOrderId: ORDER_ID }),
    ).toBeNull();
  });

  test.each([0, -1, 12.5])("refuses a non-positive/non-integer amount (%p)", async (amount) => {
    const { tx, values } = makeTx();

    await expect(
      openUsageBill(tx as never, {
        operatorRole: "shop",
        operatorId: SHOP_ID,
        amountBdt: amount,
        sourceOrderId: ORDER_ID,
      }),
    ).rejects.toThrow(/positive integer paisa/);
    expect(values).toHaveLength(0);
  });
});
