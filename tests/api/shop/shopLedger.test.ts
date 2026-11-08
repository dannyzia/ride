/**
 * lib/shopLedger.test.ts — §12 settlement writer unit.
 *
 * The tx here is a hand-rolled stub (the writer needs select/insert on the
 * caller's transaction object) so the assertions read as the actual SQL shapes
 * the writer produces: order_revenue credit always; commission handled by
 * EXACTLY ONE of the two billing models.
 *
 * Batch-2 Item 8b pins the exclusivity matrix (never both, never neither):
 *   possession                    | ledger commission | usage accrual
 *   ------------------------------|-------------------|--------------
 *   active package, rate > 0      | NO (gross revenue)| YES, at pkg rate
 *   active package, no rate       | yes, legacy %     | no
 *   rows exist, none usable       | no (0%)           | no
 *   no possession at all (legacy) | yes, config %     | no   ← byte-for-byte
 */
import { jest } from "@jest/globals";
import { reverseShopOrder, settleShopOrder, type ShopTx } from "@/lib/shopLedger";
import { accrueUsageBill, reduceUsageBillForReversal } from "@/lib/billsLedger";

const mockRequireInt = jest.fn<(...args: unknown[]) => Promise<number>>();
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/platformConfig", () => ({
  requireConfigInt: (key: string) => mockRequireInt(key),
}));
jest.mock("@/lib/billsLedger", () => ({
  accrueUsageBill: jest.fn(async () => ({ billId: "bill-1", amount_bdt: 0 })),
  reduceUsageBillForReversal: jest.fn(async () => ({ billId: "bill-1", amount_bdt: 0 })),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

interface PossessionRow {
  status: string;
  expires_at: Date | null;
  commission_percent: string | null;
}

/**
 * select call order inside settleShopOrder: (1) existing shop_ledger rows,
 * (2) the shop's operator_packages rows. reverseShopOrder reads (1), then (2)
 * only when the order was postpaid (no commission row).
 */
function makeTx(
  existing: { entry_type: string; amount_bdt?: number }[] = [],
  possession: PossessionRow[] = [],
) {
  const inserts: Record<string, unknown>[] = [];
  let selectIndex = 0;
  const rowsFor = (index: number): unknown[] =>
    index === 0
      ? existing.map((e) => ({ entry_type: e.entry_type, amount_bdt: e.amount_bdt ?? 0 }))
      : possession;

  const chain = (rows: unknown[]) => {
    const c: Record<string, unknown> = {
      from: () => c,
      leftJoin: () => c,
      where: () => c,
      orderBy: () => c,
      limit: async () => rows,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return c;
  };

  const tx = {
    select: jest.fn(() => {
      const rows = rowsFor(selectIndex);
      selectIndex++;
      return chain(rows);
    }),
    insert: jest.fn(() => ({
      values: jest.fn((vals: Record<string, unknown>) => {
        inserts.push(vals);
        return { then: (r: (v: unknown) => unknown) => r(vals) };
      }),
    })),
  } as unknown as ShopTx & { insert: jest.Mock };
  return { tx, inserts };
}

const PACKAGE_5: PossessionRow = {
  status: "active",
  expires_at: null,
  commission_percent: "5.00",
};

describe("shopLedger — settlement writer (§12)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── legacy (unpackaged) shops: byte-for-byte ─────────────────────────────

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
    expect(out).toEqual({
      order_revenue_bdt: 10_000,
      commission_bdt: -800,
      usage_accrued_bdt: 0,
      delivery_fee_bdt: 0,
    });
    expect(mockRequireInt).toHaveBeenCalledWith("shop_commission_percent");
    expect(accrueUsageBill).not.toHaveBeenCalled();
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
    expect(out.commission_bdt).toBe(0);
    expect(accrueUsageBill).not.toHaveBeenCalled();
  });

  it("is a no-op when the order is already settled in the same tx", async () => {
    const { tx, inserts } = makeTx([{ entry_type: "order_revenue" }]);

    await settleShopOrder(tx, { id: "order-3", shop_id: "shop-1", subtotal_bdt: 1_000 });

    expect(inserts).toHaveLength(0);
    expect(accrueUsageBill).not.toHaveBeenCalled();
  });

  it("credits the delivery fee to the shop on self-delivery (C6-4)", async () => {
    mockRequireInt.mockResolvedValue(8);
    const { tx, inserts } = makeTx();

    const out = await settleShopOrder(
      tx,
      { id: "order-5", shop_id: "shop-1", subtotal_bdt: 10_000, delivery_fee_bdt: 2_000 },
      { selfDelivered: true },
    );

    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([
      ["order_revenue", 10_000],
      ["commission", -800], // 8% of the items subtotal — never on the fee
      ["delivery_fee", 2_000], // the shop delivered it itself, so it keeps the fee
    ]);
    expect(out).toEqual({
      order_revenue_bdt: 10_000,
      commission_bdt: -800,
      usage_accrued_bdt: 0,
      delivery_fee_bdt: 2_000,
    });
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

  it("propagates a missing config key as a 500 (no invented zero)", async () => {
    mockRequireInt.mockRejectedValue(
      Object.assign(new Error("Missing platform_config key"), { status: 500 }),
    );
    const { tx } = makeTx();

    await expect(
      settleShopOrder(tx, { id: "order-4", shop_id: "shop-1", subtotal_bdt: 1_000 }),
    ).rejects.toMatchObject({ status: 500 });
  });

  // ── Batch-2 Item 8b: postpaid-gross, never double-billed ────────────────

  it("a package rate REPLACES the legacy percent and accrues — the ledger keeps GROSS", async () => {
    const { tx, inserts } = makeTx([], [PACKAGE_5]);

    const out = await settleShopOrder(tx, {
      id: "order-8",
      shop_id: "shop-1",
      subtotal_bdt: 10_000,
      delivery_fee_bdt: 2_000,
    });

    // Postpaid: revenue only — NO commission debit on the ledger.
    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([
      ["order_revenue", 10_000],
    ]);
    // A-1: the legacy percent is never read when the package carries a rate.
    expect(mockRequireInt).not.toHaveBeenCalled();
    // One receivable, at the PACKAGE rate (5%), into the aggregate usage bill.
    expect(accrueUsageBill).toHaveBeenCalledWith(tx, {
      operatorRole: "shop",
      operatorId: "shop-1",
      amountBdt: 500,
    });
    expect(out).toEqual({
      order_revenue_bdt: 10_000,
      commission_bdt: 0, // nothing came off the ledger
      usage_accrued_bdt: 500, // the fee lives on the bill
      delivery_fee_bdt: 0,
    });
  });

  it("a package with no rate falls back to the legacy percent and accrues nothing", async () => {
    mockRequireInt.mockResolvedValue(8);
    const { tx, inserts } = makeTx([], [
      { status: "active", expires_at: null, commission_percent: null },
    ]);

    const out = await settleShopOrder(tx, { id: "order-9", shop_id: "shop-1", subtotal_bdt: 10_000 });

    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([
      ["order_revenue", 10_000],
      ["commission", -800],
    ]);
    expect(mockRequireInt).toHaveBeenCalledWith("shop_commission_percent");
    expect(accrueUsageBill).not.toHaveBeenCalled();
    expect(out.commission_bdt).toBe(-800);
  });

  it("an exhausted possession accrues 0 (no commission, no bill, no legacy read)", async () => {
    const { tx, inserts } = makeTx([], [
      { status: "active", expires_at: new Date(Date.now() - 86_400_000), commission_percent: "5.00" },
    ]);

    const out = await settleShopOrder(tx, {
      id: "order-10",
      shop_id: "shop-1",
      subtotal_bdt: 10_000,
    });

    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([["order_revenue", 10_000]]);
    expect(out.commission_bdt).toBe(0);
    expect(mockRequireInt).not.toHaveBeenCalled();
    expect(accrueUsageBill).not.toHaveBeenCalled();
  });

  // ── Batch-2 Item 8b: reversal mirrors the pair that was written ─────────

  it("reversing a POSTPAID order takes the fee back out of the usage bill", async () => {
    // Postpaid settlement wrote revenue only; the package still governs.
    const { tx, inserts } = makeTx([{ entry_type: "order_revenue", amount_bdt: 10_000 }], [PACKAGE_5]);

    const out = await reverseShopOrder(
      tx,
      { id: "order-11", shop_id: "shop-1", subtotal_bdt: 10_000 },
      { reason: "admin force-cancel" },
    );

    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([["reversal", -10_000]]);
    expect(reduceUsageBillForReversal).toHaveBeenCalledWith(tx, {
      operatorRole: "shop",
      operatorId: "shop-1",
      amountBdt: 500,
    });
    expect(out).toEqual({ reversed_bdt: -10_000 });
  });

  it("reversing a LEGACY order unwinds the debit and never touches a bill", async () => {
    const { tx, inserts } = makeTx([
      { entry_type: "order_revenue", amount_bdt: 10_000 },
      { entry_type: "commission", amount_bdt: -800 },
    ]);

    const out = await reverseShopOrder(
      tx,
      { id: "order-12", shop_id: "shop-1" },
      { reason: "admin force-cancel" },
    );

    expect(inserts.map((i) => [i.entry_type, i.amount_bdt])).toEqual([["reversal", -9_200]]);
    expect(reduceUsageBillForReversal).not.toHaveBeenCalled();
    expect(out).toEqual({ reversed_bdt: -9_200 });
  });

  it("a reversal with no commission leg and no package reduces nothing", async () => {
    mockRequireInt.mockResolvedValue(8); // legacy percent today
    // Revenue only, but no package governs — the postpaid pair cannot be proven,
    // so no bill is meddled with (the legacy rate is never applied to it).
    const { tx } = makeTx([{ entry_type: "order_revenue", amount_bdt: 10_000 }], []);

    await reverseShopOrder(
      tx,
      { id: "order-13", shop_id: "shop-1", subtotal_bdt: 10_000 },
      { reason: "admin force-cancel" },
    );

    expect(mockRequireInt).toHaveBeenCalledWith("shop_commission_percent");
    expect(reduceUsageBillForReversal).not.toHaveBeenCalled();
  });
});
