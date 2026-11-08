// Shared commission-dues ledger math.
//
// Batch-2 Item 4: net dues generalize — `operator_unpaid_obligations` is the
// unified owed-figure view keyed (operator_role, operator_id); the driver
// surface keeps working through `driver_unpaid_obligations`, now a thin
// wrapper over it (operator_role='driver'). Figures are integer paisa,
// kind-filtered and snapshot-gated. This replaces the hand-rolled
// rides/settlements sums so the dues screens, the settle-first gate, the
// account-deletion gate, and dispatch can never drift (§3.3, M-14 drift-guard
// tests in tests/concurrency/driver-unpaid-obligations.test.ts).
//
// The batched dispatch query helper stays DRIVER-scoped
// (utils-server/dispatch.ts — see the comment at its batched-debt block):
// non-driver pool admission is NOT Batch-2 scope.
//
// Stage note: the generalized view exposes the NET only, so accrued_bdt/
// settled_bdt mirror the net; due_bdt is exact. Stage 3 (Item 17) rebuilds
// the dues route on the view columns directly.
import { db } from '@/src/db';
import { sql } from 'drizzle-orm';

export type OperatorRole = 'driver' | 'shop' | 'delivery' | 'fleet';

export interface DriverCommissionDues {
  /** Total commission liability outstanding, integer paisa (view net). */
  accrued_bdt: number;
  /** Settled through the gateway, integer paisa (view net, Stage 1). */
  settled_bdt: number;
  /** Outstanding liability, floored at zero, integer paisa. */
  due_bdt: number;
}

export interface DriverUnpaidObligations {
  unpaidSubscriptionPaisa: number;
  netCommissionPaisa: number;
  totalUnpaidPaisa: number;
  activeSelfBillPaisa: number;
  lockoutExposurePaisa: number;
}

/** DB tx handle type. */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Any drizzle query executor: the pool, or a caller's transaction. */
export type DuesExecutor = DbTx | typeof db;

const EMPTY_OBLIGATIONS: DriverUnpaidObligations = {
  unpaidSubscriptionPaisa: 0,
  netCommissionPaisa: 0,
  totalUnpaidPaisa: 0,
  activeSelfBillPaisa: 0,
  lockoutExposurePaisa: 0,
};

/** Net commission liability for one driver from the wrapper (floored at zero). */
export async function computeDriverCommissionDuesWith(
  exec: DuesExecutor,
  driverId: string,
): Promise<DriverCommissionDues> {
  const [row] = await exec.execute(
    sql`SELECT net_commission_paisa FROM driver_unpaid_obligations WHERE driver_id = ${driverId}`,
  );
  const net = Math.max(0, Number((row as { net_commission_paisa: unknown })?.net_commission_paisa ?? 0));
  return { accrued_bdt: net, settled_bdt: net, due_bdt: net };
}

export async function computeDriverCommissionDues(
  driverId: string,
): Promise<DriverCommissionDues> {
  return computeDriverCommissionDuesWith(db, driverId);
}

/** Batch-2 Item 4: full owed-figure row from the GENERALIZED view
 * (operator_unpaid_obligations) for ANY operator role — shop/delivery/fleet
 * rows exist once they hold an open bill; missing rows read as all-zero.
 * Consumed by the settle-first gate, the dues screen, the deletion gate, and
 * dispatch (driver path via the thin wrapper below). */
export async function getOperatorUnpaidObligations(
  operatorRole: OperatorRole,
  operatorId: string,
  exec: DuesExecutor,
): Promise<DriverUnpaidObligations> {
  const [row] = await exec.execute(sql`
    SELECT unpaid_subscription_paisa, net_commission_paisa, total_unpaid_paisa,
           active_self_bill_paisa, lockout_exposure_paisa
    FROM operator_unpaid_obligations
    WHERE operator_role = ${operatorRole} AND operator_id = ${operatorId}
  `);
  const r = (row ?? {}) as {
    unpaid_subscription_paisa: unknown;
    net_commission_paisa: unknown;
    total_unpaid_paisa: unknown;
    active_self_bill_paisa: unknown;
    lockout_exposure_paisa: unknown;
  };
  return {
    unpaidSubscriptionPaisa: Number(r.unpaid_subscription_paisa ?? 0),
    netCommissionPaisa: Number(r.net_commission_paisa ?? 0),
    totalUnpaidPaisa: Number(r.total_unpaid_paisa ?? 0),
    activeSelfBillPaisa: Number(r.active_self_bill_paisa ?? 0),
    lockoutExposurePaisa: Number(r.lockout_exposure_paisa ?? 0),
  };
}

/** Driver thin wrapper over the generalized view (operator_role='driver') —
 * every existing driver consumer keeps its signature and figures unchanged. */
export async function getDriverUnpaidObligations(
  exec: DuesExecutor,
  driverId: string,
): Promise<DriverUnpaidObligations> {
  return getOperatorUnpaidObligations('driver', driverId, exec);
}
