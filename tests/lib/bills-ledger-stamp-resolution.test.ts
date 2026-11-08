/**
 * Batch-2 Item 7/8b — settleSubscriptionBill resolution.
 *
 * PRIMARY  resolution-by-pre-stamp: every bill stamped with this event settles,
 *          under the operator's purchase lock. A subscription bill is 1:1 with
 *          its event; the aggregated usage receivables may share one stamp
 *          (Item 8b, migration 0100 scopes the M-14 index), so ONE payment
 *          settles them all.
 * FALLBACK the C-B2 literal driver resolution for unstamped events.
 * Replay   already settled by this event → no-op (null).
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/paymentEvents", () => ({}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { settleSubscriptionBill } from "@/lib/billsLedger";

const OP_ID = "aaaa1111-aaaa-4aaa-8aaa-aaaa11111111";
const DRIVER_ID = "dddd1111-dddd-4ddd-8ddd-dddd11111111";
const EVENT_ID = "eeee1111-eeee-4eee-8eee-eeee11111111";

type Row = Record<string, unknown>;

/** One result set per select call, in call order. */
function makeTx(queue: Row[][]) {
  let i = 0;
  const updates: { set: Row }[] = [];
  const chain = (rows: Row[]) => {
    const c: Record<string, unknown> = {
      from: () => c,
      leftJoin: () => c,
      where: () => c,
      orderBy: () => c,
      for: () => c,
      limit: async () => rows,
      // Thenable: a query may be awaited on a non-limit terminus (e.g. FOR UPDATE
      // over the whole stamped set).
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return c;
  };
  const tx = {
    select: jest.fn(() => {
      const rows = queue[i] ?? [];
      i++;
      return chain(rows);
    }),
    execute: jest.fn(async (_statement: unknown) => [] as unknown[]),
    update: jest.fn(() => ({
      set: (values: Row) => ({
        where: async () => {
          updates.push({ set: values });
        },
      }),
    })),
  };
  return { tx, updates };
}

function billRow(overrides: Row = {}): Row {
  return {
    id: "bill-1",
    operator_role: "shop",
    operator_id: OP_ID,
    kind: "subscription_purchase",
    status: "open",
    amount_bdt: 5_000,
    payment_event_id: EVENT_ID,
    ...overrides,
  };
}

function stampRow(overrides: Row = {}): Row {
  return { id: "bill-1", operator_role: "shop", operator_id: OP_ID, ...overrides };
}

function eventRow(overrides: Row = {}): Row {
  return { id: EVENT_ID, driver_id: null, amount_bdt: 5_000, ...overrides };
}

function lockParams(tx: { execute: jest.Mock }): unknown[] {
  return new PgDialect().sqlToQuery(tx.execute.mock.calls[0][0] as never).params;
}

describe("settleSubscriptionBill — stamp resolution", () => {
  test("a stamped non-driver bill settles under the role-scoped purchase lock", async () => {
    const { tx, updates } = makeTx([[eventRow()], [stampRow()], [billRow()]]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toMatchObject({
      billId: "bill-1",
      billIds: ["bill-1"],
      amountBdt: 5_000,
    });
    expect(lockParams(tx)).toContain(`purchase_bill_shop:${OP_ID}`);
    expect(updates[0].set).toMatchObject({ status: "settled", payment_event_id: EVENT_ID });
    expect(updates[1].set).toMatchObject({ status: "paid" });
  });

  test("a stamped driver bill uses the legacy driver lock string", async () => {
    const { tx } = makeTx([[eventRow({ driver_id: DRIVER_ID })],
      [stampRow({ id: "bill-2", operator_role: "driver", operator_id: DRIVER_ID })],
      [billRow({ id: "bill-2", operator_role: "driver", operator_id: DRIVER_ID })],
    ]);

    await settleSubscriptionBill(tx as never, { eventId: EVENT_ID });

    const params = lockParams(tx);
    expect(params).toContain(`purchase_bill_${DRIVER_ID}`);
    expect(params).not.toContain(`purchase_bill_driver:${DRIVER_ID}`);
  });

  test("ONE event settles EVERY usage bill it stamped (Item 8b aggregate)", async () => {
    const { tx, updates } = makeTx([[eventRow({ amount_bdt: 5_500 })],
      [
        stampRow({ id: "usage-a" }),
        stampRow({ id: "usage-b" }),
      ],
      [
        billRow({ id: "usage-a", kind: "usage", amount_bdt: 5_000, due_at: null }),
        billRow({ id: "usage-b", kind: "usage", amount_bdt: 500, due_at: null }),
      ],
    ]);

    const result = await settleSubscriptionBill(tx as never, { eventId: EVENT_ID });

    expect(result).toMatchObject({
      billId: "usage-a",
      billIds: ["usage-a", "usage-b"],
      amountBdt: 5_500,
    });
    const settled = updates.filter((u) => u.set.status === "settled");
    expect(settled).toHaveLength(2);
    expect(settled.every((u) => u.set.payment_event_id === EVENT_ID)).toBe(true);
    // The advisory lock is taken once per distinct operator, not per bill.
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  test("replay: a bill already settled by this event is a no-op", async () => {
    const { tx, updates } = makeTx([[eventRow()], [stampRow()], [billRow({ status: "settled" })]]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toBeNull();
    expect(updates).toHaveLength(0);
  });

  test("a stamped bill that is not open settles nothing", async () => {
    const { tx, updates } = makeTx([[eventRow()], [stampRow()], [billRow({ status: "void" })]]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toBeNull();
    expect(updates).toHaveLength(0);
  });
});

describe("settleSubscriptionBill — C-B2 fallback", () => {
  test("an unstamped driver event resolves the driver's single open bill", async () => {
    const { tx, updates } = makeTx([[eventRow({ driver_id: DRIVER_ID })],
      [], // no stamp
      [billRow({ id: "bill-3", operator_role: "driver", operator_id: DRIVER_ID })],
    ]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toMatchObject({
      billId: "bill-3",
      billIds: ["bill-3"],
    });
    expect(lockParams(tx)).toContain(`purchase_bill_${DRIVER_ID}`);
    expect(updates[0].set).toMatchObject({ status: "settled" });
  });

  test("an unstamped non-driver event resolves nothing (no identity on the event)", async () => {
    const { tx, updates } = makeTx([[eventRow()], []]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toBeNull();
    expect(tx.execute).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
