/**
 * Batch-2 Item 8 — the aggregate usage bill writer.
 *
 * Pinned:
 *   - ONE open usage bill per operator: the first accrual opens it, every later
 *     one increments amount_bdt (never a second row);
 *   - writes serialize on `usage_bill_<role>:<id>`;
 *   - due_at is NULL (commission is payable at any time, D6);
 *   - non-positive / non-integer amounts are programming errors;
 *   - reversal subtracts, and a bill reduced to zero is voided (it must leave
 *     the owed figure and free the one-open slot);
 *   - a settled bill is money already received and is never rewritten.
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/idempotency", () => ({ driverErrorCode: () => null }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { accrueUsageBill, reduceUsageBillForReversal } from "@/lib/billsLedger";

const SHOP_ID = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

/** `selectQueue` supplies one result set per select call, in call order. */
function makeTx(selectQueue: Row[][] = [], insertReturning: Row[] = []) {
  let selectIndex = 0;
  const execute = jest.fn(async (_statement: unknown) => [] as unknown[]);
  const updates: Row[] = [];
  const inserts: Row[] = [];
  const chain = (rows: Row[]) => {
    const c: Record<string, unknown> = {
      from: () => c,
      where: () => c,
      for: () => c,
      limit: async () => rows,
    };
    return c;
  };
  const tx = {
    execute,
    select: jest.fn(() => {
      const rows = selectQueue[selectIndex] ?? [];
      selectIndex++;
      return chain(rows);
    }),
    update: jest.fn(() => ({
      set: (vals: Row) => ({
        where: async () => {
          updates.push(vals);
        },
      }),
    })),
    insert: jest.fn(() => ({
      values: (vals: Row) => {
        inserts.push(vals);
        return { onConflictDoNothing: () => ({ returning: async () => insertReturning }) };
      },
    })),
  };
  return { tx, execute, updates, inserts };
}

function lockParams(execute: jest.Mock): unknown[] {
  return new PgDialect().sqlToQuery(execute.mock.calls[0][0] as never).params;
}

describe("accrueUsageBill", () => {
  test("opens the operator's single usage bill with no due date", async () => {
    const { tx, updates, inserts, execute } = makeTx([[]], [{ id: "bill-1", amount_bdt: 800 }]);

    const out = await accrueUsageBill(tx as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 800,
    });

    expect(out).toEqual({ billId: "bill-1", amount_bdt: 800 });
    expect(inserts[0]).toMatchObject({
      operator_id: SHOP_ID,
      operator_role: "shop",
      kind: "usage",
      status: "open",
      amount_bdt: 800,
      due_at: null,
      subscription_id: null,
    });
    expect(updates).toHaveLength(0);
    expect(lockParams(execute)).toContain(`usage_bill_shop:${SHOP_ID}`);
  });

  test("increments the existing bill instead of opening a second one", async () => {
    const { tx, updates, inserts } = makeTx([[{ id: "bill-1", amount_bdt: 800 }]]);

    const out = await accrueUsageBill(tx as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 500,
    });

    expect(out).toEqual({ billId: "bill-1", amount_bdt: 1_300 });
    expect(updates[0]).toMatchObject({ amount_bdt: 1_300 });
    expect(inserts).toHaveLength(0);
  });

  test("a lost insert race folds the increment into the winner's row", async () => {
    const { tx, updates, inserts } = makeTx(
      [[], [{ id: "bill-2", amount_bdt: 200 }]],
      [], // unique index rejected our insert
    );

    const out = await accrueUsageBill(tx as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 300,
    });

    expect(inserts).toHaveLength(1);
    expect(out).toEqual({ billId: "bill-2", amount_bdt: 500 });
    expect(updates[0]).toMatchObject({ amount_bdt: 500 });
  });

  test.each([0, -5, 12.5])("refuses a non-positive / non-integer amount (%p)", async (amount) => {
    const { tx, inserts, execute } = makeTx([[]]);

    await expect(
      accrueUsageBill(tx as never, {
        operatorRole: "shop",
        operatorId: SHOP_ID,
        amountBdt: amount,
      }),
    ).rejects.toThrow(/positive integer paisa/);
    expect(inserts).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("reduceUsageBillForReversal", () => {
  test("subtracts the order's commission from the aggregate", async () => {
    const { tx, updates, execute } = makeTx([[{ id: "bill-1", amount_bdt: 1_300 }]]);

    const out = await reduceUsageBillForReversal(tx as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 800,
    });

    expect(out).toEqual({ billId: "bill-1", amount_bdt: 500 });
    expect(updates[0]).toMatchObject({ amount_bdt: 500, status: "open" });
    expect(lockParams(execute)).toContain(`usage_bill_shop:${SHOP_ID}`);
  });

  test("a bill reduced to zero is voided, not left open at zero", async () => {
    const { tx, updates } = makeTx([[{ id: "bill-1", amount_bdt: 800 }]]);

    const out = await reduceUsageBillForReversal(tx as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 800,
    });

    expect(out).toEqual({ billId: "bill-1", amount_bdt: 0 });
    expect(updates[0]).toMatchObject({ amount_bdt: 0, status: "void" });
  });

  test("nothing open (e.g. already settled) → null, nothing written", async () => {
    const { tx, updates } = makeTx([[]]);

    expect(
      await reduceUsageBillForReversal(tx as never, {
        operatorRole: "shop",
        operatorId: SHOP_ID,
        amountBdt: 800,
      }),
    ).toBeNull();
    expect(updates).toHaveLength(0);
  });
});
