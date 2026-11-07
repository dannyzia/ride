// Shared commission-dues ledger math.
//
// Net dues = `total_unpaid_paisa` from `driver_unpaid_obligations` — the
// single owed-figure view (unpaid subscription bills + net commission dues,
// kind-filtered and snapshot-gated, integer paisa). This replaces the
// hand-rolled rides/settlements sums so the dues screen, the settle-first
// gate, the account-deletion gate, and dispatch can never drift (§3.3,
// M-14 drift-guard test in tests/concurrency/driver-unpaid-obligations.test.ts).
//
// Stage 1 note: the view exposes the NET only, so accrued_bdt/settled_bdt
// mirror the net here; due_bdt is exact. Stage 3 (Item 17) rebuilds the dues
// route on the view columns directly.
import { db } from '@/src/db';
import { sql } from 'drizzle-orm';

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

/** Net commission liability for one driver from the view (floored at zero). */
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

/** Full owed-figure row from the view, consumed by the settle-first gate,
 *  the dues screen, the deletion gate, and dispatch (batched form in Stage 2).
 */
export async function getDriverUnpaidObligations(
  exec: DuesExecutor,
  driverId: string,
): Promise<DriverUnpaidObligations> {
  const [row] = await exec.execute(sql`
    SELECT unpaid_subscription_paisa, net_commission_paisa, total_unpaid_paisa,
           active_self_bill_paisa, lockout_exposure_paisa
    FROM driver_unpaid_obligations
    WHERE driver_id = ${driverId}
  `);
  if (!row) return EMPTY_OBLIGATIONS;
  const r = row as {
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
