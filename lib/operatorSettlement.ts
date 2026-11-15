// Batch-2 Item 7 — unified settlement + statement per operator role.
//
// Two responsibilities, both for the NON-driver operators (shop/delivery/fleet);
// the driver rail (app/api/driver/dues*) is untouched:
//
//   1. STATEMENT — one owed figure (operator_unpaid_obligations), the itemized
//      open bills split into subscription vs usage/commission, the role's debt
//      ceiling and the headroom under it, and the four-state precedence
//      NO_PRODUCT > LAPSED > OWING > ACTIVE.
//   2. SETTLEMENT — stamp-then-invoice settlement of the operator's open bills,
//      in either slot: the due-dated package bill (`subscription_purchase`, 1:1
//      with its event) or the aggregated commission receivable (`usage`,
//      Batch-2 Item 8). With no kind named it pays whichever is outstanding, so
//      every figure the purchase gate counts can be paid down (see
//      OPERATOR_BILL_KIND_ORDER).
//      Batch-2 Item 8b: the usage slot is settled as a SET — one invoice clears
//      EVERY open usage bill, all of them stamped with the same event
//      (initiateUsageSettlement + lib/billsLedger.settleStampedBills), which is
//      why migration 0100 scopes the one-event-one-bill barrier to subscription
//      bills.
//      `initiateOperatorSettlement` creates the payment event
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
import { db } from "@/src/db";
import { operatorBills, operatorPackages, packages } from "@/src/db/schema";
import { getOperatorUnpaidObligations, type DuesExecutor } from "@/lib/commissionDues";
import { DUST_DUES_PAISA, type NonDriverOperatorRole } from "@/lib/operatorPurchase";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import { getDebtCeilingForRole } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";

/** ৳10 — the PortPos hosted-checkout minimum, integer paisa (M-09 floor). */
export const MIN_PAYMENT_BDT = 1_000;

export type OperatorSettlementErrorCode =
  | "no_open_bill"
  | "amount_below_minimum"
  /** The usage set moved between pricing the invoice and stamping it (8b). */
  | "amount_changed";

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

/** The bill kind a settlement targets. Both slots are 1:1 per operator:
 * `operator_bills_one_open_uq` (subscription_purchase) and
 * `operator_bills_one_open_usage_uq` (usage, Batch-2 Item 8). */
export type SettleableBillKind = "subscription_purchase" | "usage";

/**
 * Which bill a kind-less settlement pays, in order. The gate counts BOTH
 * kinds (operator_unpaid_obligations: open subscription + open usage), so a
 * rail that only pays one of them deadlocks the operator the moment the other
 * is the only thing outstanding: the purchase gate refuses to sell credit
 * while dues stand, and there is no receivable to pay them down with. Fixing
 * the precedence here — due-dated package bill first, aggregated commission
 * second — is what makes every kind the gate counts settleable. A caller that
 * names `bill_kind` still gets exactly that bill.
 */
export const OPERATOR_BILL_KIND_ORDER: readonly SettleableBillKind[] = [
  "subscription_purchase",
  "usage",
];

/** The operator's single open bill of the requested kind. */
async function findOpenBill(
  exec: DuesExecutor,
  operatorRole: NonDriverOperatorRole,
  operatorId: string,
  kind: SettleableBillKind,
) {
  const [bill] = await exec
    .select({
      id: operatorBills.id,
      kind: operatorBills.kind,
      amount_bdt: operatorBills.amount_bdt,
      status: operatorBills.status,
    })
    .from(operatorBills)
    .where(
      and(
        eq(operatorBills.operator_role, operatorRole),
        eq(operatorBills.operator_id, operatorId),
        eq(operatorBills.status, "open"),
        eq(operatorBills.kind, kind),
      ),
    )
    .orderBy(asc(operatorBills.created_at))
    .limit(1);
  return bill ?? null;
}

/**
 * The bill this settlement pays: the named kind, or — when the pay entry
 * names none — the first outstanding kind in OPERATOR_BILL_KIND_ORDER. The
 * resolved KIND travels with the bill, so the stamp can never target a
 * different slot than the invoice was priced from.
 */
async function resolveOpenBill(
  exec: DuesExecutor,
  operatorRole: NonDriverOperatorRole,
  operatorId: string,
  kind?: SettleableBillKind,
) {
  if (kind) return findOpenBill(exec, operatorRole, operatorId, kind);
  for (const candidate of OPERATOR_BILL_KIND_ORDER) {
    const bill = await findOpenBill(exec, operatorRole, operatorId, candidate);
    if (bill) return bill;
  }
  return null;
}

export interface OperatorSettlementInitiation {
  operatorRole: NonDriverOperatorRole;
  operatorId: string;
  /** Authenticated caller — payment_events.user_id (driver_id stays NULL). */
  userId: string;
  customer?: { name?: string | null; email?: string | null; phone?: string | null };
  serverUrl: string;
  packageName?: string;
  /**
   * Which receivable to settle. Omitted → whichever kind is outstanding, in
   * OPERATOR_BILL_KIND_ORDER (package bill first, then the usage aggregate),
   * reported back as `bill_kind` on the result.
   */
  billKind?: SettleableBillKind;
  /** Read executor override (tests / callers already inside a read context). */
  exec?: DuesExecutor;
}

export interface OperatorSettlementResult {
  billId: string;
  /** Every bill this one event settles — >1 only on the aggregated usage rail. */
  bill_ids: string[];
  /** The kind actually settled — resolved when the caller named none. */
  bill_kind: SettleableBillKind;
  paymentEventId: string;
  amountBdt: number;
  payment_url: string;
  payment_event_id: string;
}

export interface OperatorUsageSettlementResult {
  bill_kind: "usage";
  bill_ids: string[];
  amountBdt: number;
  payment_url: string;
  payment_event_id: string;
}

/** Every open usage bill for an operator (the one-open slot means 0 or 1 today;
 * the list keeps the rail correct if usage ever becomes per-period). */
async function findOpenUsageBills(
  exec: DuesExecutor,
  operatorRole: NonDriverOperatorRole,
  operatorId: string,
) {
  return exec
    .select({ id: operatorBills.id, amount_bdt: operatorBills.amount_bdt })
    .from(operatorBills)
    .where(
      and(
        eq(operatorBills.operator_role, operatorRole),
        eq(operatorBills.operator_id, operatorId),
        eq(operatorBills.status, "open"),
        eq(operatorBills.kind, "usage"),
      ),
    )
    .orderBy(asc(operatorBills.created_at));
}

/**
 * Start a USAGE settlement — Batch-2 Item 8b.
 *
 * The aggregated commission receivable is settled as a SET: every open usage
 * bill is stamped with ONE payment event and the callback settles them all
 * together (lib/billsLedger.settleStampedBills). The barrier is scoped to
 * subscription bills by migration 0100, so the shared stamp is legal.
 *
 * DUST (D1): a set totalling under the ৳10 PortPos minimum is not invoiced at
 * all — it rolls forward into the next accrual and the caller gets the typed
 * `amount_below_minimum`, never a stranded half-payment.
 *
 * AMOUNT INTEGRITY: the invoice is priced from the set read here; if the shop
 * accrues another order between pricing and the stamp, the set no longer match
 * the invoice and the settlement aborts with `amount_changed` (409) instead of
 * collecting a stale figure — the caller retries with a fresh total.
 */
export async function initiateUsageSettlement(
  params: Omit<OperatorSettlementInitiation, "billKind">,
): Promise<OperatorUsageSettlementResult> {
  const exec = params.exec ?? db;

  const openBills = await findOpenUsageBills(exec, params.operatorRole, params.operatorId);
  if (openBills.length === 0) {
    throw new OperatorSettlementError("no_open_bill", "No outstanding commission dues to settle", 400);
  }
  const priced = openBills.reduce((sum, bill) => sum + bill.amount_bdt, 0);
  if (priced < MIN_PAYMENT_BDT) {
    throw new OperatorSettlementError(
      "amount_below_minimum",
      `commission dues of ${priced} paisa are below the settlement minimum ${MIN_PAYMENT_BDT} — they roll forward`,
      400,
    );
  }

  const initiated = await initiatePortposPayment({
    user_id: params.userId,
    idempotency_key: `operator_usage_settle_${crypto.randomUUID()}`,
    amount_bdt: priced,
    purpose: "subscription_settlement",
    package_name: params.packageName ?? "Commission Dues",
    customer_name: params.customer?.name ?? "",
    customer_email: params.customer?.email ?? "",
    customer_phone: params.customer?.phone ?? "",
    redirect_url: `${params.serverUrl}/payment/success`,
    ipn_url: `${params.serverUrl}/api/payment/portpos/callback`,
  });
  if (!initiated) {
    throw new OperatorSettlementError(
      "no_open_bill",
      "The commission settlement invoice could not be created",
      500,
    );
  }

  const stamped = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${operatorPurchaseLockKey(params.operatorRole, params.operatorId)}))`,
    );

    const bills = await tx
      .select({ id: operatorBills.id, amount_bdt: operatorBills.amount_bdt })
      .from(operatorBills)
      .where(
        and(
          eq(operatorBills.operator_role, params.operatorRole),
          eq(operatorBills.operator_id, params.operatorId),
          eq(operatorBills.status, "open"),
          eq(operatorBills.kind, "usage"),
        ),
      )
      .orderBy(asc(operatorBills.created_at))
      .for("update");

    if (bills.length === 0) {
      throw new OperatorSettlementError(
        "no_open_bill",
        "The commission dues were settled or replaced while the invoice was created",
        409,
      );
    }

    const total = bills.reduce((sum, bill) => sum + bill.amount_bdt, 0);
    if (total !== priced) {
      throw new OperatorSettlementError(
        "amount_changed",
        `commission dues changed from ${priced} to ${total} paisa while the invoice was created — retry the settlement`,
        409,
      );
    }

    // Stamp only: the bills stay OPEN until the payment is confirmed. Marking
    // them settled here would credit money the gateway has not collected yet.
    for (const bill of bills) {
      await tx
        .update(operatorBills)
        .set({ payment_event_id: initiated.payment_event_id, updated_at: new Date() })
        .where(eq(operatorBills.id, bill.id));
    }

    return { billIds: bills.map((bill) => bill.id), amountBdt: total };
  });

  logger.info("[operatorSettlement] usage settlement initiated and bills stamped", {
    operatorRole: params.operatorRole,
    operatorId: params.operatorId,
    billIds: stamped.billIds,
    paymentEventId: initiated.payment_event_id,
    amountBdt: stamped.amountBdt,
  });

  return {
    bill_kind: "usage",
    bill_ids: stamped.billIds,
    amountBdt: stamped.amountBdt,
    payment_url: initiated.payment_url,
    payment_event_id: initiated.payment_event_id,
  };
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

  const open = await resolveOpenBill(
    exec,
    params.operatorRole,
    params.operatorId,
    params.billKind,
  );
  if (!open) {
    throw new OperatorSettlementError("no_open_bill", "No outstanding bill to settle", 400);
  }
  // Batch-2 Item 8b: the usage receivable is settled as a SET (one payment for
  // every open usage bill), so it has its own rail. Everything that reaches
  // this point is the 1:1 package bill.
  if (open.kind === "usage") {
    const usage = await initiateUsageSettlement(params);
    return {
      billId: usage.bill_ids[0],
      bill_ids: usage.bill_ids,
      bill_kind: "usage",
      paymentEventId: usage.payment_event_id,
      amountBdt: usage.amountBdt,
      payment_url: usage.payment_url,
      payment_event_id: usage.payment_event_id,
    };
  }
  assertSettleableAmount(open.amount_bdt);
  // The resolved slot — never the caller's default — is what gets stamped.
  const billKind: SettleableBillKind = open.kind as SettleableBillKind;

  const initiated = await initiatePortposPayment({
    user_id: params.userId,
    // driver_id intentionally omitted: NULL for every non-driver settlement.
    idempotency_key: `operator_settle_${crypto.randomUUID()}`,
    amount_bdt: open.amount_bdt,
    purpose: "subscription_settlement",
    package_name:
      params.packageName ??
      (billKind === "usage" ? "Commission Dues" : "Operator Package Bill"),
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
        kind: operatorBills.kind,
        amount_bdt: operatorBills.amount_bdt,
        status: operatorBills.status,
      })
      .from(operatorBills)
      .where(
        and(
          eq(operatorBills.operator_role, params.operatorRole),
          eq(operatorBills.operator_id, params.operatorId),
          eq(operatorBills.status, "open"),
          eq(operatorBills.kind, billKind),
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

    return { id: bill.id, amount_bdt: bill.amount_bdt, kind: billKind };
  });

  logger.info("[operatorSettlement] settlement initiated and bill stamped", {
    operatorRole: params.operatorRole,
    operatorId: params.operatorId,
    billKind,
    billId: stamped.id,
    paymentEventId: initiated.payment_event_id,
    amountBdt: stamped.amount_bdt,
  });

  return {
    billId: stamped.id,
    bill_ids: [stamped.id],
    bill_kind: stamped.kind,
    paymentEventId: initiated.payment_event_id,
    amountBdt: stamped.amount_bdt,
    payment_url: initiated.payment_url,
    payment_event_id: initiated.payment_event_id,
  };
}
