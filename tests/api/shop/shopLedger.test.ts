/**
 * lib/shopLedger.test.ts — §12 settlement writer unit.
 *
 * The tx here is a hand-rolled stub (the writer only needs select/insert on
 * the caller's transaction object) so the assertions read as the actual SQL
 * shapes the writer produces: order_revenue credit always; commission debit
 * only when the fresh-read percent is > 0; integer paisa math throughout.
 */
import { jest } from "@jest/globals";
import { settleShopOrder, type ShopTx } from "@/lib/shopLedger";

const mockRequireInt = jest.fn<(...args: unknown[]) => Promise<number>>();
jest.mock("@/lib/platformConfig", () => ({
  requireConfigInt: (key: string) => mockRequireInt(key),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

function makeTx(existing: { entry_type: string }[] = []) {
  const inserts: Record<string, unknown>[] = [];
  const tx = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          then: (r: (v: unknown) => unknown) =>
            r(existing.map((e) => ({ entry_type: e.entry_type }))),
        })),
      })),
      then: (r: (v: unknown) => unknown) => r(existing.map((e) => ({ entry_type: e.entry_type }))),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((vals: Record<string, unknown>) => {
        inserts.push(vals);
        return {
          then: (r: (v: unknown) => unknown) => r(vals),
        };
      }),
    })),
  } as unknown as ShopTx & { insert: jest.Mock };
  return { tx, inserts };
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
    expect(out).toEqual({ order_revenue_bdt: 10_000, commission_bdt: -800 });
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
