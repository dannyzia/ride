/**
 * lib/shopLedger.test.ts — §12 settlement writer unit.
 *
 * The tx here is a hand-rolled stub (the writer only needs select/insert on
 * the caller's transaction object) so the assertions read as the actual SQL
 * shapes the writer produces: order_revenue credit always; commission debit
 * only when the fresh-read percent is > 0; integer paisa math throughout.
 */
import { jest } from "@jest/globals";
import { reverseShopOrder, settleShopOrder, type ShopTx } from "@/lib/shopLedger";
import { operatorBills } from "@/src/db/schema";

const mockRequireInt = jest.fn<(...args: unknown[]) => Promise<number>>();
// The writer now also creates usage bills through lib/billsLedger, which
// imports the pool — the tx is always injected, so the module-level db is inert.
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/platformConfig", () => ({
  requireConfigInt: (key: string) => mockRequireInt(key),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

function makeTx(existing: { entry_type: string; amount_bdt?: number }[] = []) {
  const inserts: Record<string, unknown>[] = [];
  const billUpdates: Record<string, unknown>[] = [];
  // Batch-2 Item 8: the same transaction also inserts operator_bills rows
  // (usage bills, via lib/billsLedger.openUsageBill) — bucketed separately so
  // the ledger assertions below stay about shop_ledger entries.
  const billInserts: Record<string, unknown>[] = [];
  const tx = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          then: (r: (v: unknown) => unknown) =>
            r(existing.map((e) => ({ entry_type: e.entry_type, amount_bdt: e.amount_bdt ?? 0 }))),
        })),
      })),
      then: (r: (v: unknown) => unknown) =>
        r(existing.map((e) => ({ entry_type: e.entry_type, amount_bdt: e.amount_bdt ?? 0 }))),
    })),
    // Batch-2 Item 8: reverseShopOrder voids the accrued usage bill.
    update: jest.fn(() => ({
      set: (vals: Record<string, unknown>) => {
        billUpdates.push(vals);
        return { where: () => ({ returning: async () => [{ id: "bill-void-1" }] }) };
      },
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((vals: Record<string, unknown>) => {
        const isBill = table === operatorBills;
        (isBill ? billInserts : inserts).push(vals);
        return {
          onConflictDoNothing: () => ({
            returning: async () => (isBill ? [vals] : []),
          }),
          then: (r: (v: unknown) => unknown) => r(vals),
        };
      }),
    })),
  } as unknown as ShopTx & { insert: jest.Mock };
  return { tx, inserts, billInserts, billUpdates };
}

describe("shopLedger — settlement writer (§12)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("credits order_revenue and debits commission at a non-zero fresh percent", async () => {
    mockRequireInt.mockResolvedValue(8);
    const { tx, inserts } = makeTx();

    const out = await settleShopOrder(tx, {
      id: "order-1",
      shop_id: "shop-1",
      subtotal_bdt: 10_000, // ৳10.00 items total
    });

    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([
      ["order_revenue", 10_000],
      ["commission", -800], // 8% of 10000 paisa, integer rounding
    ]);
    expect(out).toEqual({ order_revenue_bdt: 10_000, commission_bdt: -800, delivery_fee_bdt: 0 });
    // commission is fresh-read — never a code constant
    expect(mockRequireInt).toHaveBeenCalledWith("shop_commission_percent");
  });

  it("skips the commission row when the fresh percent is zero (launch default)", async () => {
    mockRequireInt.mockResolvedValue(0);
    const { tx, inserts } = makeTx();

    const out = await settleShopOrder(tx, {
      id: "order-2",
      shop_id: "shop-1",
      subtotal_bdt: 50_000,
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ entry_type: "order_revenue", amount_bdt: 50_000 });
    expect(out.commission_bdt).toBe(-0);
  });

  it("is a no-op when the order is already settled in the same tx", async () => {
    const { tx, inserts } = makeTx([{ entry_type: "order_revenue" }]);

    await settleShopOrder(tx, {
      id: "order-3",
      shop_id: "shop-1",
      subtotal_bdt: 1_000,
    });

    expect(inserts).toHaveLength(0);
  });

  it("credits the delivery fee to the shop on self-delivery (C6-4)", async () => {
    mockRequireInt.mockResolvedValue(8);
    const { tx, inserts } = makeTx();

    const out = await settleShopOrder(
      tx,
      {
        id: "order-5",
        shop_id: "shop-1",
        subtotal_bdt: 10_000,
        delivery_fee_bdt: 2_000, // customer-paid, snapshotted at placement
      },
      { selfDelivered: true },
    );

    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([
      ["order_revenue", 10_000],
      ["commission", -800], // 8% of the items subtotal — never on the fee
      ["delivery_fee", 2_000], // the shop delivered it itself, so it keeps the fee
    ]);
    expect(out).toEqual({ order_revenue_bdt: 10_000, commission_bdt: -800, delivery_fee_bdt: 2_000 });
  });

  it("books no delivery_fee row for a courier delivery even when a fee snapshot is present", async () => {
    mockRequireInt.mockResolvedValue(0);
    const { tx, inserts } = makeTx();

    const out = await settleShopOrder(tx, {
      id: "order-6",
      shop_id: "shop-1",
      subtotal_bdt: 50_000,
      delivery_fee_bdt: 2_000, // the courier's COD remittance — settleDeliveryLeg owns it
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ entry_type: "order_revenue", amount_bdt: 50_000 });
    expect(out.delivery_fee_bdt).toBe(0);
  });

  it("books no delivery_fee row for self-delivery with a zero fee", async () => {
    mockRequireInt.mockResolvedValue(0);
    const { tx, inserts } = makeTx();

    await settleShopOrder(
      tx,
      { id: "order-7", shop_id: "shop-1", subtotal_bdt: 50_000, delivery_fee_bdt: 0 },
      { selfDelivered: true },
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ entry_type: "order_revenue" });
  });

  it("accrues ONE usage bill for the commission, keyed by the source order (Batch-2 Item 8)", async () => {
    mockRequireInt.mockResolvedValue(8);
    const { tx, billInserts } = makeTx();

    await settleShopOrder(
      tx,
      {
        id: "order-8",
        shop_id: "shop-1",
        subtotal_bdt: 10_000,
        delivery_fee_bdt: 2_000,
      },
      { selfDelivered: true },
    );

    // The platform fee is the commission only — never the delivery fee.
    expect(billInserts).toHaveLength(1);
    expect(billInserts[0]).toMatchObject({
      operator_role: "shop",
      operator_id: "shop-1",
      kind: "usage",
      status: "open",
      amount_bdt: 800,
      source_order_id: "order-8",
      subscription_id: null,
    });
  });

  it("accrues NO usage bill at the launch default of 0% (owed figure unchanged)", async () => {
    mockRequireInt.mockResolvedValue(0);
    const { tx, billInserts } = makeTx();

    await settleShopOrder(tx, { id: "order-9", shop_id: "shop-1", subtotal_bdt: 50_000 });

    expect(billInserts).toHaveLength(0);
  });

  it("voids the accrued usage bill when an order's settlement is reversed (Batch-2 Item 8)", async () => {
    const { tx, inserts, billUpdates } = makeTx([
      { entry_type: "order_revenue", amount_bdt: 10_000 },
      { entry_type: "commission", amount_bdt: -800 },
    ]);

    const out = await reverseShopOrder(
      tx,
      { id: "order-r", shop_id: "shop-1" },
      { reason: "admin force-cancel" },
    );

    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([["reversal", -9_200]]);
    // The receivable leaves the owed figure with the ledger debit.
    expect(billUpdates).toHaveLength(1);
    expect(billUpdates[0]).toMatchObject({ status: "void" });
    expect(out).toEqual({ reversed_bdt: -9_200 });
  });

  it("propagates a missing config key as a 500 (no invented zero)", async () => {
    mockRequireInt.mockRejectedValue(
      Object.assign(new Error("Missing platform_config key"), { status: 500 }),
    );
    const { tx } = makeTx();

    await expect(
      settleShopOrder(tx, { id: "order-4", shop_id: "shop-1", subtotal_bdt: 1_000 }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
