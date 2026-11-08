/**
 * Batch-2 Item 8b — the settle-first gate reads ACCRUED COMMISSION.
 *
 * The two halves of the shop money model meet here:
 *   lib/billsLedger.accrueUsageBill  (the delivered-order accrual, write side)
 *   operator_unpaid_obligations      (the owed figure the purchase gate reads)
 *   lib/operatorPurchase             (the gate itself)
 *
 * Pinned: an accrued usage bill rolls into `total_unpaid_paisa`, so a shop that
 * owes commission cannot buy another package until that bill is SETTLED — and
 * the moment it is, the same purchase goes through. Dust under ৳10 does not
 * block (D1). Nothing here is mocked at the dues layer: `db.execute` answers the
 * real view query from the test's bill rows, so the wiring under test is the
 * shipped one (lib/commissionDues + lib/operatorPurchase).
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/monetizationMode", () => {
  class OperatorPackageActiveError extends Error {}
  return { grantOperatorPackage: jest.fn(), OperatorPackageActiveError };
});
jest.mock("@/lib/billsLedger", () => {
  const actual = jest.requireActual("@/lib/billsLedger") as Record<string, unknown>;
  class BillSlotConflictError extends Error {}
  // Keep the real accrual writer; the purchase path's bill opener is stubbed.
  return { ...actual, createOpenBill: jest.fn(), BillSlotConflictError };
});
jest.mock("@/lib/launchRoles", () => ({ heldRoles: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "@/src/db";
import { accrueUsageBill } from "@/lib/billsLedger";
import { createOpenBill } from "@/lib/billsLedger";
import { grantOperatorPackage } from "@/lib/monetizationMode";
import {
  purchaseOperatorPackage,
  OperatorPurchaseError,
} from "@/lib/operatorPurchase";

const SHOP_ID = "77777777-7777-4777-8777-777777777777";
const PACKAGE_ID = "88888888-8888-4888-8888-888888888888";
const EXPIRES_AT = new Date("2026-12-08T00:00:00.000Z");

type Bill = {
  id: string;
  operator_role: string;
  operator_id: string;
  kind: string;
  status: string;
  amount_bdt: number;
};

let bills: Bill[];

type Pkg = Parameters<typeof purchaseOperatorPackage>[0]["pkg"];

function pkg(overrides: Partial<Record<string, unknown>> = {}): Pkg {
  return {
    id: PACKAGE_ID,
    name: "Shop Starter",
    call_count: 50,
    duration_days: 30,
    price_bdt: 5_000,
    is_trial: false,
    is_active: true,
    product_type: "call_package",
    applicable_roles: ["shop"],
    ...overrides,
  } as unknown as Pkg;
}

/**
 * Answers the REAL view query (lib/commissionDues is not mocked) from `bills`,
 * applying the same arithmetic as migration 0097: open subscription bills plus,
 * for non-driver roles, open usage/commission bills.
 */
function viewRow(operatorRole: string, operatorId: string) {
  const open = bills.filter(
    (b) => b.operator_role === operatorRole && b.operator_id === operatorId && b.status === "open",
  );
  const subscription = open
    .filter((b) => b.kind === "subscription_purchase")
    .reduce((sum, b) => sum + b.amount_bdt, 0);
  const usage =
    operatorRole === "driver"
      ? 0
      : open
          .filter((b) => b.kind !== "subscription_purchase")
          .reduce((sum, b) => sum + b.amount_bdt, 0);
  const total = subscription + usage;
  return {
    unpaid_subscription_paisa: subscription,
    net_commission_paisa: usage,
    total_unpaid_paisa: total,
    active_self_bill_paisa: 0,
    lockout_exposure_paisa: total,
  };
}

function duesExecutor() {
  return {
    execute: jest.fn(async (query: unknown) => {
      const { sql: text, params } = new PgDialect().sqlToQuery(query as never);
      if (!text.includes("operator_unpaid_obligations")) return [] as unknown[];
      const [role, id] = params as [string, string];
      return [viewRow(role, id)];
    }),
  };
}

/** The tx the real accrueUsageBill writes through: no existing slot → insert. */
function accrualTx() {
  const emptyChain: Record<string, unknown> = {
    from: () => emptyChain,
    where: () => emptyChain,
    for: () => emptyChain,
    limit: async () => [],
  };
  return {
    execute: jest.fn(async (_q: unknown) => [] as unknown[]),
    select: jest.fn(() => emptyChain),
    insert: jest.fn(() => ({
      values: (vals: Record<string, unknown>) => {
        const id = `usage-${bills.length + 1}`;
        bills.push({
          id,
          operator_role: String(vals.operator_role),
          operator_id: String(vals.operator_id),
          kind: String(vals.kind),
          status: String(vals.status),
          amount_bdt: Number(vals.amount_bdt),
        });
        return {
          onConflictDoNothing: () => ({
            returning: async () => [{ id, amount_bdt: vals.amount_bdt }],
          }),
        };
      },
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  bills = [];
  (db.execute as jest.Mock).mockImplementation(
    duesExecutor().execute as unknown as (q: unknown) => Promise<unknown[]>,
  );
  // The tx handle answers the same view query through the same mock, so a test
  // that changes what the view reports between the pre-check and the re-check
  // exercises the real in-tx guard.
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: (q: unknown) => (db.execute as jest.Mock)(q) }),
  );
  (grantOperatorPackage as jest.Mock).mockResolvedValue({
    id: "grant-1",
    operator_role: "shop",
    operator_id: SHOP_ID,
    package_id: PACKAGE_ID,
    status: "active",
    expires_at: EXPIRES_AT,
  });
  (createOpenBill as jest.Mock).mockResolvedValue({
    id: "bill-1",
    operator_id: SHOP_ID,
    operator_role: "shop",
    amount_bdt: 5_000,
    due_at: EXPIRES_AT,
    status: "open",
  });
});

async function expectBlocked(promise: Promise<unknown>): Promise<OperatorPurchaseError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(OperatorPurchaseError);
    const err = e as OperatorPurchaseError;
    expect(err.code).toBe("dues_outstanding_purchase_blocked");
    return err;
  }
  throw new Error("expected the purchase to be blocked, it resolved instead");
}

const buy = () =>
  purchaseOperatorPackage({ operatorRole: "shop", operatorId: SHOP_ID, pkg: pkg() });

describe("accrued usage dues vs the purchase gate", () => {
  test("an accrued usage bill blocks the purchase until it is settled", async () => {
    // A delivered order accrued ৳25.00 of commission into the one usage bill.
    await accrueUsageBill(accrualTx() as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 2_500,
    });
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ kind: "usage", status: "open", amount_bdt: 2_500 });

    const err = await expectBlocked(buy());
    // The blocked figure IS the accrued commission — not a subscription bill.
    expect(err.details.total_unpaid_paisa).toBe(2_500);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(grantOperatorPackage).not.toHaveBeenCalled();
    expect(createOpenBill).not.toHaveBeenCalled();

    // The settlement rail pays it; lib/billsLedger marks the bill settled.
    bills[0].status = "settled";

    const result = await buy();
    expect(result.bill).toMatchObject({ id: "bill-1" });
    expect(grantOperatorPackage).toHaveBeenCalledTimes(1);
  });

  test("the block follows the bill, not the order: a second accrual keeps it blocked", async () => {
    await accrueUsageBill(accrualTx() as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 1_000,
    });
    await expectBlocked(buy());

    // Another order settles into the same aggregate (the stub opens a new row
    // because it has no in-tx slot persistence; the view sums open rows).
    await accrueUsageBill(accrualTx() as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 900,
    });

    const err = await expectBlocked(buy());
    expect(err.details.total_unpaid_paisa).toBe(1_900);
  });

  test("commission dust under ৳10 does not block (D1)", async () => {
    await accrueUsageBill(accrualTx() as never, {
      operatorRole: "shop",
      operatorId: SHOP_ID,
      amountBdt: 600,
    });

    const result = await buy();
    expect(result.bill).toMatchObject({ id: "bill-1" });
  });

  test("the in-tx re-check catches dues that accrued after the pre-check", async () => {
    // Pre-check on the pool sees nothing owed…
    let calls = 0;
    (db.execute as jest.Mock).mockImplementation(async (query: unknown) => {
      const { sql: text, params } = new PgDialect().sqlToQuery(query as never);
      if (!text.includes("operator_unpaid_obligations")) return [];
      calls++;
      if (calls === 1) return [viewRow("shop", SHOP_ID)];
      // …then an order accrues before the transaction's re-check.
      bills.push({
        id: "usage-racer",
        operator_role: "shop",
        operator_id: SHOP_ID,
        kind: "usage",
        status: "open",
        amount_bdt: 4_000,
      });
      const [role, id] = params as [string, string];
      return [viewRow(role, id)];
    });

    const err = await expectBlocked(buy());
    expect(err.details.total_unpaid_paisa).toBe(4_000);
    expect(grantOperatorPackage).not.toHaveBeenCalled();
  });
});
