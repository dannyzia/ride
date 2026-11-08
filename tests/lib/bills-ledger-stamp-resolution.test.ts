/**
 * Batch-2 Item 7 — settleSubscriptionBill resolution.
 *
 * PRIMARY  resolution-by-pre-stamp: the bill whose payment_event_id is this
 *          event settles, under the operator's purchase lock. The event needs
 *          no identity, which is what lets the PortPos callback stay generic.
 * FALLBACK the C-B2 literal driver resolution for unstamped events.
 * Replay   a bill already settled by this event is a no-op (null).
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

/**
 * One result set per select call, in call order. `sel` returns the nth queued
 * rows for both the plain and the FOR UPDATE shapes.
 */
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

function lockParams(tx: { execute: jest.Mock }): unknown[] {
  return new PgDialect().sqlToQuery(tx.execute.mock.calls[0][0] as never).params;
}

describe("settleSubscriptionBill — stamp resolution", () => {
  test("a stamped non-driver bill settles under the role-scoped purchase lock", async () => {
    const { tx, updates } = makeTx([
      [{ id: EVENT_ID, driver_id: null }],
      [{ id: "bill-1", operator_role: "shop", operator_id: OP_ID }],
      [billRow()],
    ]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toEqual({
      billId: "bill-1",
    });
    expect(lockParams(tx)).toContain(`purchase_bill_shop:${OP_ID}`);
    expect(updates[0].set).toMatchObject({ status: "settled", payment_event_id: EVENT_ID });
    expect(updates[1].set).toMatchObject({ status: "paid" });
  });

  test("a stamped driver bill uses the legacy driver lock string", async () => {
    const { tx } = makeTx([
      [{ id: EVENT_ID, driver_id: DRIVER_ID }],
      [{ id: "bill-2", operator_role: "driver", operator_id: DRIVER_ID }],
      [billRow({ id: "bill-2", operator_role: "driver", operator_id: DRIVER_ID })],
    ]);

    await settleSubscriptionBill(tx as never, { eventId: EVENT_ID });

    const params = lockParams(tx);
    expect(params).toContain(`purchase_bill_${DRIVER_ID}`);
    expect(params).not.toContain(`purchase_bill_driver:${DRIVER_ID}`);
  });

  test("replay: a bill already settled by this event is a no-op", async () => {
    const { tx, updates } = makeTx([
      [{ id: EVENT_ID, driver_id: null }],
      [{ id: "bill-1", operator_role: "shop", operator_id: OP_ID }],
      [billRow({ status: "settled" })],
    ]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toBeNull();
    expect(updates).toHaveLength(0);
  });

  test("a stamped bill that is not open settles nothing", async () => {
    const { tx, updates } = makeTx([
      [{ id: EVENT_ID, driver_id: null }],
      [{ id: "bill-1", operator_role: "shop", operator_id: OP_ID }],
      [billRow({ status: "void" })],
    ]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toBeNull();
    expect(updates).toHaveLength(0);
  });
});

describe("settleSubscriptionBill — C-B2 fallback", () => {
  test("an unstamped driver event resolves the driver's single open bill", async () => {
    const { tx, updates } = makeTx([
      [{ id: EVENT_ID, driver_id: DRIVER_ID }],
      [], // no stamp
      [billRow({ id: "bill-3", operator_role: "driver", operator_id: DRIVER_ID })],
    ]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toEqual({
      billId: "bill-3",
    });
    expect(lockParams(tx)).toContain(`purchase_bill_${DRIVER_ID}`);
    expect(updates[0].set).toMatchObject({ status: "settled" });
  });

  test("an unstamped non-driver event resolves nothing (no identity on the event)", async () => {
    const { tx, updates } = makeTx([[{ id: EVENT_ID, driver_id: null }], []]);

    expect(await settleSubscriptionBill(tx as never, { eventId: EVENT_ID })).toBeNull();
    expect(tx.execute).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
