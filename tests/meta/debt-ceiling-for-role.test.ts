/**
 * Batch-2 Item 5 — getDebtCeilingForRole reader (pure unit, rows-in mock).
 *
 * Pins the role→key mapping and fresh-read behavior:
 *   - 'driver'   → max_commission_debt_bdt (the existing key, unchanged)
 *   - 'shop'     → max_debt_ceiling_shop_bdt
 *   - 'delivery' → max_debt_ceiling_delivery_bdt
 *   - 'fleet'    → max_debt_ceiling_fleet_bdt
 *   - unknown    → driver key (safe default)
 * The db.select mock serves ONE queued row per call; the test enqueues the
 * value each role is expected to read — a wrong role→key mapping surfaces as
 * the wrong figure.
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { getDebtCeilingForRole } from "@/lib/platformConfig";

let queued: { value: string }[][];

beforeEach(() => {
  jest.clearAllMocks();
  queued = [];
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queued.shift() ?? [];
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
        })),
      })),
    };
  });
});

describe("getDebtCeilingForRole — per-role debt ceilings (Batch-2 Item 5)", () => {
  test("driver reads the existing max_commission_debt_bdt key", async () => {
    queued = [[{ value: "50000" }]];
    expect(await getDebtCeilingForRole("driver")).toBe(50000);
  });

  test("shop reads max_debt_ceiling_shop_bdt", async () => {
    queued = [[{ value: "5500" }]];
    expect(await getDebtCeilingForRole("shop")).toBe(5500);
  });

  test("delivery reads max_debt_ceiling_delivery_bdt", async () => {
    queued = [[{ value: "60000" }]];
    expect(await getDebtCeilingForRole("delivery")).toBe(60000);
  });

  test("fleet reads max_debt_ceiling_fleet_bdt", async () => {
    queued = [[{ value: "70000" }]];
    expect(await getDebtCeilingForRole("fleet")).toBe(70000);
  });

  test("unknown role falls back to the driver key (safe default)", async () => {
    queued = [[{ value: "45000" }]];
    expect(await getDebtCeilingForRole("partner")).toBe(45000);
  });

  test("fresh read: successive calls for the same role can see new values", async () => {
    queued = [[{ value: "50000" }], [{ value: "60000" }]];
    expect(await getDebtCeilingForRole("driver")).toBe(50000);
    expect(await getDebtCeilingForRole("driver")).toBe(60000);
  });

  test("optional executor reads through the caller's transaction (Items 8-10 hooks)", async () => {
    const execute = jest.fn(async () => [{ value: "62000" }]);
    expect(await getDebtCeilingForRole("shop", { execute } as never)).toBe(62000);
    expect(execute).toHaveBeenCalledTimes(1);
    // The executor path must not fall through to the pool read.
    expect(db.select).not.toHaveBeenCalled();
  });

  test("optional executor falls back to the ৳500 default when the row is absent", async () => {
    const execute = jest.fn(async () => []);
    expect(await getDebtCeilingForRole("fleet", { execute } as never)).toBe(50000);
  });
});
