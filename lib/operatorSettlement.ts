// Batch-2 Item 7 — unified settlement + statement per operator role.
//
// Two responsibilities, both for the NON-driver operators (shop/delivery/fleet);
// the driver rail (app/api/driver/dues*) is untouched:
//
//   1. STATEMENT — one owed figure (operator_unpaid_obligations), the itemized
//      open bills split into subscription vs usage/commission, the role's debt
//      ceiling and the headroom under it, and the four-state precedence
//      NO_PRODUCT > LAPSED > OWING > ACTIVE.
//   2. SETTLEMENT — stamp-then-invoice settlement of the operator's single open
//      subscription bill. `initiateOperatorSettlement` creates the payment event
//      through lib/paymentEvents (the single payment_events writer) and then, in
//      ONE transaction under the operator's purchase lock, stamps the bill with
//      that event id. The stamp is what lib/billsLedger.settleSubscriptionBill
//      resolves on at the PortPos callback, so the callback needs no operator
//      identity and no schema change to payment_events.
//
// AMOUNT POLICY (M-09): a bill is settled in full or not at all. The admin price
// floor guarantees every bill is either ৳0 (no bill is created at all) or
// >= 1,000 paisa, so the PortPos minimum is structurally satisfied — asserted
// here so a future writer that bypasses the floor fails loudly instead of
// stranding an unpayable bill.
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/src/db";
import { operatorBills, operatorPackages, packages } from "@/src/db/schema";
import { getOperatorUnpaidObligations, type DuesExecutor } from "@/lib/commissionDues";
import { DUST_DUES_PAISA, type NonDriverOperatorRole } from "@/lib/operatorPurchase";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import { getDebtCeilingForRole } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";

/** ৳10 — the PortPos hosted-checkout minimum, integer paisa (M-09 floor). */
export const MIN_PAYMENT_BDT = 1_000;

export type OperatorSettlementErrorCode = "no_open_bill" | "amount_below_minimum";

export class OperatorSettlementError extends Error {
  constructor(
    readonly code: OperatorSettlementErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OperatorSettlementError";
  }
}

/**
 * Non-driver monetization state for the dues screen. Deliberately four states:
 * CEILING_LOCKED is absent because usage lockout is deferred (Item 4's pinned
 * deferral), and PRODUCT_FROZEN is driver-only — non-driver possession has no
 * frozen concept. PURCHASE_BLOCKED is client-side, on the typed 409.
 */
export type OperatorDuesState = "NO_PRODUCT" | "LAPSED" | "OWING" | "ACTIVE";

export interface OperatorStatementBill {
  id: string;
  kind: string;
  amount_bdt: number;
  due_at: Date | null;
  created_at: Date;
}

export interface OperatorStatement {
  operator_role: NonDriverOperatorRole;
  operator_id: string;
  state: OperatorDuesState;
  total_unpaid_paisa: number;
  unpaid_subscription_paisa: number;
  net_commission_paisa: number;
  debt_ceiling_paisa: number;
  credit_headroom_paisa: number;
  open_subscription_bills: OperatorStatementBill[];
  open_usage_bills: OperatorStatementBill[];
  active_package: {
    package_id: string;
    name: string | null;
    started_at: Date;
    expires_at: Date | null;
  } | null;
}

/** The lock string shared with lib/operatorPurchase (bill writer). */
function operatorPurchaseLockKey(operatorRole: NonDriverOperatorRole, operatorId: string): string {
  return `purchase_bill_${operatorRole}:${operatorId}`;
}

/** M-09 structural assertion: every bill that exists must be settleable. */
function assertSettleableAmount(amountBdt: number): void {
  if (amountBdt < MIN_PAYMENT_BDT) {
    throw new OperatorSettlementError(
      "amount_below_minimum",
      `bill amount ${amountBdt} is below the settlement minimum ${MIN_PAYMENT_BDT} — the M-09 price floor was bypassed`,
      500,
    );
  }
}

/**
 * The operator's statement. Reads only — never mutates, and never trusts a
 * client figure: total_unpaid_paisa is the view's number for this operator.
 */
export async function getOperatorStatement(
  operatorRole: NonDriverOperatorRole,
  operatorId: string,
  exec: DuesExecutor = db,
): Promise<OperatorStatement> {
  const [obligations, bills, [possession], ceiling] = await Promise.all([
    getOperatorUnpaidObligations(operatorRole, operatorId, exec),
    exec
      .select({
        id: operatorBills.id,
        kind: operatorBills.kind,
        amount_bdt: operatorBills.amount_bdt,
        due_at: operatorBills.due_at,
        created_at: operatorBills.created_at,
      })
      .from(operatorBills)
      .where(
        and(
          eq(operatorBills.operator_role, operatorRole),
          eq(operatorBills.operator_id, operatorId),
          eq(operatorBills.status, "open"),
        ),
      )
      .orderBy(desc(operatorBills.created_at)),
    exec
      .select({
        package_id: operatorPackages.package_id,
        name: packages.name,
        started_at: operatorPackages.started_at,
        expires_at: operatorPackages.expires_at,
      })
      .from(operatorPackages)
      .leftJoin(packages, eq(operatorPackages.package_id, packages.id))
      .where(
        and(
          eq(operatorPackages.operator_role, operatorRole),
          eq(operatorPackages.operator_id, operatorId),
          eq(operatorPackages.status, "active"),
        ),
      )
      .limit(1),
    getDebtCeilingForRole(operatorRole),
  ]);

  const now = new Date();
  const possessionUsable = Boolean(
    possession && (possession.expires_at === null || possession.expires_at > now),
  );

  // Pinned precedence: NO_PRODUCT > LAPSED > OWING > ACTIVE.
  const state: OperatorDuesState = !possession
    ? "NO_PRODUCT"
    : !possessionUsable
      ? "LAPSED"
      : obligations.totalUnpaidPaisa >= DUST_DUES_PAISA
        ? "OWING"
        : "ACTIVE";

  const subscriptionBills = bills.filter((b) => b.kind === "subscription_purchase");
  const usageBills = bills.filter((b) => b.kind !== "subscription_purchase");

  return {
    operator_role: operatorRole,
    operator_id: operatorId,
    state,
    total_unpaid_paisa: obligations.totalUnpaidPaisa,
    unpaid_subscription_paisa: obligations.unpaidSubscriptionPaisa,
    net_commission_paisa: obligations.netCommissionPaisa,
    debt_ceiling_paisa: ceiling,
    credit_headroom_paisa: Math.max(0, ceiling - obligations.totalUnpaidPaisa),
    open_subscription_bills: subscriptionBills,
    open_usage_bills: usageBills,
    active_package: possession ?? null,
  };
}

/** The operator's single open subscription bill (one-open barrier). */
async function findOpenBill(
  exec: DuesExecutor,
  operatorRole: NonDriverOperatorRole,
  operatorId: string,
) {
  const [bill] = await exec
    .select({
      id: operatorBills.id,
      amount_bdt: operatorBills.amount_bdt,
      status: operatorBills.status,
    })
    .from(operatorBills)
    .where(
      and(
        eq(operatorBills.operator_role, operatorRole),
        eq(operatorBills.operator_id, operatorId),
        eq(operatorBills.status, "open"),
        eq(operatorBills.kind, "subscription_purchase"),
      ),
    )
    .orderBy(asc(operatorBills.created_at))
    .limit(1);
  return bill ?? null;
}

export interface OperatorSettlementInitiation {
  operatorRole: NonDriverOperatorRole;
  operatorId: string;
  /** Authenticated caller — payment_events.user_id (driver_id stays NULL). */
  userId: string;
  customer?: { name?: string | null; email?: string | null; phone?: string | null };
  serverUrl: string;
  packageName?: string;
  /** Read executor override (tests / callers already inside a read context). */
  exec?: DuesExecutor;
}

export interface OperatorSettlementResult {
  billId: string;
  paymentEventId: string;
  amountBdt: number;
  payment_url: string;
  payment_event_id: string;
}

/**
 * Start a full-bill settlement for a non-driver operator.
 *
 * ORDER (and why): the payment event must exist before the bill can be stamped,
 * and payment_events rows may only be created by lib/paymentEvents — so the
 * invoice is created first and the stamp transaction runs immediately after, on
 * the SAME advisory lock the purchase takes. A failed initiation leaves the
 * bill unstamped and open; a payment that fails after initiation leaves the
 * stamp in place and the bill open, and the next attempt overwrites the stamp
 * with its own event id (the event→bill direction is what is unique, so one
 * event still settles at most one bill).
 */
export async function initiateOperatorSettlement(
  params: OperatorSettlementInitiation,
): Promise<OperatorSettlementResult> {
  const exec = params.exec ?? db;

  const open = await findOpenBill(exec, params.operatorRole, params.operatorId);
  if (!open) {
    throw new OperatorSettlementError("no_open_bill", "No outstanding bill to settle", 400);
  }
  assertSettleableAmount(open.amount_bdt);

  const initiated = await initiatePortposPayment({
    user_id: params.userId,
    // driver_id intentionally omitted: NULL for every non-driver settlement.
    idempotency_key: `operator_settle_${randomUUID()}`,
    amount_bdt: open.amount_bdt,
    purpose: "subscription_settlement",
    package_name: params.packageName ?? "Operator Package Bill",
    customer_name: params.customer?.name ?? "",
    customer_email: params.customer?.email ?? "",
    customer_phone: params.customer?.phone ?? "",
    redirect_url: `${params.serverUrl}/payment/success`,
    ipn_url: `${params.serverUrl}/api/payment/portpos/callback`,
  });
  if (!initiated) {
    throw new OperatorSettlementError(
      "no_open_bill",
      "The settlement invoice could not be created",
      500,
    );
  }

  // ONE transaction: take the operator's purchase lock, re-read the bill under
  // FOR UPDATE, then stamp it. Bounded and DB-only — no network call in here.
  const stamped = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${operatorPurchaseLockKey(params.operatorRole, params.operatorId)}))`,
    );

    const [bill] = await tx
      .select({
        id: operatorBills.id,
        amount_bdt: operatorBills.amount_bdt,
        status: operatorBills.status,
      })
      .from(operatorBills)
      .where(
        and(
          eq(operatorBills.operator_role, params.operatorRole),
          eq(operatorBills.operator_id, params.operatorId),
          eq(operatorBills.status, "open"),
          eq(operatorBills.kind, "subscription_purchase"),
        ),
      )
      .orderBy(asc(operatorBills.created_at))
      .for("update")
      .limit(1);

    if (!bill) {
      throw new OperatorSettlementError(
        "no_open_bill",
        "The bill was settled or replaced while the invoice was created",
        409,
      );
    }
    assertSettleableAmount(bill.amount_bdt);

    await tx
      .update(operatorBills)
      .set({ payment_event_id: initiated.payment_event_id, updated_at: new Date() })
      .where(eq(operatorBills.id, bill.id));

    return { id: bill.id, amount_bdt: bill.amount_bdt };
  });

  logger.info("[operatorSettlement] settlement initiated and bill stamped", {
    operatorRole: params.operatorRole,
    operatorId: params.operatorId,
    billId: stamped.id,
    paymentEventId: initiated.payment_event_id,
    amountBdt: stamped.amount_bdt,
  });

  return {
    billId: stamped.id,
    paymentEventId: initiated.payment_event_id,
    amountBdt: stamped.amount_bdt,
    payment_url: initiated.payment_url,
    payment_event_id: initiated.payment_event_id,
  };
}
