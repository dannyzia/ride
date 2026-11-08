/**
 * Batch-2 Item 6 — the shared non-driver purchase core.
 *
 * Pinned behavior:
 *   - settle-first: unpaid >= ৳10 blocks (pre-check AND the in-tx re-check);
 *     dust (< ৳10) passes (D1).
 *   - applicability: applicable_roles must CONTAIN the caller's operator role.
 *   - ordering: grant FIRST, then bill — the bill's due_at comes from the
 *     grant's expires_at (Gate-3 dependency discipline).
 *   - D4: a ৳0 package grants with NO bill.
 *   - barrier: operator_bills one-open 23505 → dues_outstanding_purchase_blocked;
 *     operator_packages one-active 23505 → active_package_exists.
 *   - serialization: one transaction under the per-operator advisory lock.
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/commissionDues", () => ({ getOperatorUnpaidObligations: jest.fn() }));
jest.mock("@/lib/monetizationMode", () => {
  class OperatorPackageActiveError extends Error {}
  return { grantOperatorPackage: jest.fn(), OperatorPackageActiveError };
});
jest.mock("@/lib/billsLedger", () => {
  class BillSlotConflictError extends Error {}
  return { createOpenBill: jest.fn(), BillSlotConflictError };
});
jest.mock("@/lib/launchRoles", () => ({ heldRoles: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "@/src/db";
import { getOperatorUnpaidObligations } from "@/lib/commissionDues";
import { grantOperatorPackage, OperatorPackageActiveError } from "@/lib/monetizationMode";
import { createOpenBill, BillSlotConflictError } from "@/lib/billsLedger";
import { heldRoles } from "@/lib/launchRoles";
import {
  purchaseOperatorPackage,
  hasActiveOperatorRole,
  OperatorPurchaseError,
} from "@/lib/operatorPurchase";

const OPERATOR_ID = "55555555-5555-4555-8555-555555555555";
const PACKAGE_ID = "66666666-6666-4666-8666-666666666666";
const EXPIRES_AT = new Date("2026-12-08T00:00:00.000Z");

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

function obligations(totalUnpaidPaisa: number) {
  return {
    unpaidSubscriptionPaisa: totalUnpaidPaisa,
    netCommissionPaisa: 0,
    totalUnpaidPaisa,
    activeSelfBillPaisa: 0,
    lockoutExposurePaisa: totalUnpaidPaisa,
  };
}

let txExecute: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  txExecute = jest.fn(async () => []);
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: txExecute }),
  );
  (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue(obligations(0));
  (grantOperatorPackage as jest.Mock).mockResolvedValue({
    id: "grant-1",
    operator_role: "shop",
    operator_id: OPERATOR_ID,
    package_id: PACKAGE_ID,
    status: "active",
    expires_at: EXPIRES_AT,
  });
  (createOpenBill as jest.Mock).mockResolvedValue({
    id: "bill-1",
    operator_id: OPERATOR_ID,
    operator_role: "shop",
    amount_bdt: 5_000,
    due_at: EXPIRES_AT,
    status: "open",
  });
});

async function expectCode(promise: Promise<unknown>, code: string): Promise<OperatorPurchaseError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(OperatorPurchaseError);
    const err = e as OperatorPurchaseError;
    expect(err.code).toBe(code);
    return err;
  }
  throw new Error(`expected OperatorPurchaseError ${code}, resolved instead`);
}

describe("purchaseOperatorPackage — settle-first", () => {
  test("unpaid at the ৳10 threshold blocks before any transaction", async () => {
    (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue(obligations(1_000));

    const err = await expectCode(
      purchaseOperatorPackage({ operatorRole: "shop", operatorId: OPERATOR_ID, pkg: pkg() }),
      "dues_outstanding_purchase_blocked",
    );
    expect(err.details.total_unpaid_paisa).toBe(1_000);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(grantOperatorPackage).not.toHaveBeenCalled();
  });

  test("dust (999) passes both checks", async () => {
    (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue(obligations(999));

    const result = await purchaseOperatorPackage({
      operatorRole: "shop",
      operatorId: OPERATOR_ID,
      pkg: pkg(),
    });
    expect(result.bill).toMatchObject({ id: "bill-1" });
    expect(getOperatorUnpaidObligations).toHaveBeenCalledTimes(2); // pre-check + in-tx
  });

  test("the in-tx re-check blocks a purchase that became indebted after the pre-check", async () => {
    (getOperatorUnpaidObligations as jest.Mock)
      .mockResolvedValueOnce(obligations(0)) // pre-check on the pool
      .mockResolvedValueOnce(obligations(1_500)); // re-check inside the tx

    await expectCode(
      purchaseOperatorPackage({ operatorRole: "fleet", operatorId: OPERATOR_ID, pkg: pkg({ applicable_roles: ["fleet"] }) }),
      "dues_outstanding_purchase_blocked",
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(grantOperatorPackage).not.toHaveBeenCalled();
  });
});

describe("purchaseOperatorPackage — applicability", () => {
  test("a package that does not list the caller's role is rejected", async () => {
    const err = await expectCode(
      purchaseOperatorPackage({
        operatorRole: "shop",
        operatorId: OPERATOR_ID,
        pkg: pkg({ applicable_roles: ["driver", "delivery"] }),
      }),
      "package_not_applicable_to_role",
    );
    expect(err.details.operator_role).toBe("shop");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("a shared package (multi-role array) is accepted for each listed role", async () => {
    const result = await purchaseOperatorPackage({
      operatorRole: "delivery",
      operatorId: OPERATOR_ID,
      pkg: pkg({ applicable_roles: ["shop", "delivery"] }),
    });
    expect(result.operatorRole).toBe("delivery");
  });
});

describe("purchaseOperatorPackage — grant then bill", () => {
  test("priced package: grant runs before the bill and the bill is due at the grant's expiry", async () => {
    await purchaseOperatorPackage({ operatorRole: "shop", operatorId: OPERATOR_ID, pkg: pkg() });

    expect(grantOperatorPackage).toHaveBeenCalledTimes(1);
    expect(createOpenBill).toHaveBeenCalledTimes(1);
    expect((grantOperatorPackage as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (createOpenBill as jest.Mock).mock.invocationCallOrder[0],
    );

    expect(createOpenBill).toHaveBeenCalledWith(
      expect.anything(),
      {
        operatorRole: "shop",
        operatorId: OPERATOR_ID,
        packageId: PACKAGE_ID,
        subscriptionId: null,
        amountBdt: 5_000,
        dueAt: EXPIRES_AT,
      },
    );
    expect(grantOperatorPackage).toHaveBeenCalledWith(expect.anything(), {
      operatorRole: "shop",
      operatorId: OPERATOR_ID,
      package: expect.objectContaining({ id: PACKAGE_ID }),
    });
  });

  test("D4: a ৳0 package grants with no bill", async () => {
    const result = await purchaseOperatorPackage({
      operatorRole: "shop",
      operatorId: OPERATOR_ID,
      pkg: pkg({ price_bdt: 0 }),
    });
    expect(result.grant).toMatchObject({ id: "grant-1", expires_at: EXPIRES_AT.toISOString() });
    expect(result.bill).toBeNull();
    expect(createOpenBill).not.toHaveBeenCalled();
  });

  test("unlimited term: dueAt follows the grant's NULL expiry", async () => {
    (grantOperatorPackage as jest.Mock).mockResolvedValue({
      id: "grant-2",
      operator_role: "shop",
      operator_id: OPERATOR_ID,
      package_id: PACKAGE_ID,
      status: "active",
      expires_at: null,
    });
    (createOpenBill as jest.Mock).mockResolvedValue({
      id: "bill-2",
      operator_id: OPERATOR_ID,
      operator_role: "shop",
      amount_bdt: 5_000,
      due_at: null,
      status: "open",
    });

    const result = await purchaseOperatorPackage({
      operatorRole: "shop",
      operatorId: OPERATOR_ID,
      pkg: pkg({ duration_days: -1 }),
    });
    expect(createOpenBill).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dueAt: null }),
    );
    expect(result.bill).toMatchObject({ id: "bill-2", due_at: null });
  });
});

describe("purchaseOperatorPackage — serialization + barriers", () => {
  test("the transaction takes the per-operator advisory lock (role-scoped lock string)", async () => {
    await purchaseOperatorPackage({ operatorRole: "shop", operatorId: OPERATOR_ID, pkg: pkg() });

    expect(txExecute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(txExecute.mock.calls[0][0] as never);
    expect(query.sql).toContain("pg_advisory_xact_lock");
    expect(query.params).toContain(`purchase_bill_shop:${OPERATOR_ID}`);
  });

  test("open-bill 23505 → dues_outstanding_purchase_blocked (the existing barrier)", async () => {
    (createOpenBill as jest.Mock).mockRejectedValue(new BillSlotConflictError());
    await expectCode(
      purchaseOperatorPackage({ operatorRole: "shop", operatorId: OPERATOR_ID, pkg: pkg() }),
      "dues_outstanding_purchase_blocked",
    );
  });

  test("one-active-package 23505 → active_package_exists", async () => {
    (grantOperatorPackage as jest.Mock).mockRejectedValue(new OperatorPackageActiveError());
    await expectCode(
      purchaseOperatorPackage({ operatorRole: "shop", operatorId: OPERATOR_ID, pkg: pkg() }),
      "active_package_exists",
    );
  });
});

describe("hasActiveOperatorRole — §14 eligibility per role", () => {
  test("maps each operator role to its launch role and requires ACTIVE status", async () => {
    (heldRoles as jest.Mock).mockResolvedValue([
      { role: "shop_owner", status: "active" },
      { role: "delivery_man", status: "pending" },
    ]);
    expect(await hasActiveOperatorRole("shop", "u1")).toBe(true);
    expect(await hasActiveOperatorRole("delivery", "u1")).toBe(false); // pending
    expect(await hasActiveOperatorRole("fleet", "u1")).toBe(false); // not held
  });
});
