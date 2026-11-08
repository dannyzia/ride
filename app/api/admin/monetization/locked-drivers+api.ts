// [public admin] GET /api/admin/monetization/locked-drivers
//
// D7 locked-drivers card: currently-locked drivers (dispatch-locked states:
// NO_PRODUCT, CEILING_LOCKED, LAPSED) with reason, exposure, and per-reason
// aging, plus the registered_drivers_no_product count. Minimal read-only
// endpoint rendered as a card in the existing admin shell (Item 22).
//
// All figures derive from existing timestamps — no new persistence (M-15/M-05,
// D4).
import { db } from "@/src/db";
import { drivers, operatorBills, subscriptions, commissionEnrollments, rides } from "@/src/db/schema";
import { eq, and, isNull, sql, desc, asc } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

type LockReason = 'no_product' | 'debt_ceiling' | 'subscription_lapsed';

interface ObligationRow {
  driver_id: string;
  total_unpaid_paisa: string;
  lockout_exposure_paisa: string;
}

interface DriverRow {
  id: string;
  created_at: Date;
  status: string;
}

interface SubRow {
  id: string;
  driver_id: string;
  status: string;
  calls_remaining: number | null;
  expires_at: Date | null;
  frozen_at: Date | null;
  created_at: Date;
}

const NOW = new Date();
const DUST_DUES_BDT = 1_000;
const CEILING_BDT = 50_000; // max_commission_debt_bdt seed at Stage 1
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function GET(request: Request) {
  try {
    await requireAdminPermission('config.write')(request);

    // Canonical owed-figure per driver from the view (raw SQL — it's a view,
    // not a Drizzle table).
    const obligationsByDriver = new Map<string, { totalUnpaid: number; lockoutExposure: number }>();
    const oblResult = await db.execute(sql`
      SELECT driver_id, total_unpaid_paisa, lockout_exposure_paisa
      FROM driver_unpaid_obligations
    `);
    for (const r of oblResult as unknown as ObligationRow[]) {
      obligationsByDriver.set(r.driver_id, {
        totalUnpaid: Number(r.total_unpaid_paisa ?? 0),
        lockoutExposure: Number(r.lockout_exposure_paisa ?? 0),
      });
    }

    // All drivers (active).
    const driverRows: DriverRow[] = await db
      .select({ id: drivers.id, created_at: drivers.created_at, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.status, 'active'))
      .orderBy(asc(drivers.created_at));

    // Usable call subscriptions per driver + latest subscription per driver.
    const usableSubDriverIds = new Set<string>();
    const latestSubByDriver = new Map<string, SubRow>();
    const allSubs = await db
      .select({
        id: subscriptions.id,
        driver_id: subscriptions.driver_id,
        status: subscriptions.status,
        calls_remaining: subscriptions.calls_remaining,
        expires_at: subscriptions.expires_at,
        frozen_at: subscriptions.frozen_at,
        created_at: subscriptions.created_at,
      })
      .from(subscriptions);
    for (const s of allSubs) {
      const cur = latestSubByDriver.get(s.driver_id);
      if (!cur || new Date(s.created_at) > new Date(cur.created_at)) {
        latestSubByDriver.set(s.driver_id, s);
      }
      if (s.status === 'active' && s.frozen_at == null && (s.expires_at ? new Date(s.expires_at) > NOW : false) && (s.calls_remaining === -1 || (s.calls_remaining ?? 0) > 0)) {
        usableSubDriverIds.add(s.driver_id);
      }
    }

    // Active commission enrollments per driver.
    const enrolledDriverIds = new Set<string>();
    const enrRows = await db
      .select({ driver_id: commissionEnrollments.driver_id })
      .from(commissionEnrollments)
      .where(eq(commissionEnrollments.status, 'active'));
    for (const e of enrRows) enrolledDriverIds.add(e.driver_id);

    // Earliest open subscription bill per driver (ceiling-locked aging).
    // Driver surface pins operator_role='driver' (Batch-2 Item 2).
    const earliestOpenBillByDriver = new Map<string, Date>();
    const openBills = await db
      .select({ driver_id: operatorBills.operator_id, created_at: operatorBills.created_at })
      .from(operatorBills)
      .where(
        and(
          eq(operatorBills.operator_role, 'driver'),
          eq(operatorBills.status, 'open'),
          eq(operatorBills.kind, 'subscription_purchase'),
        ),
      )
      .orderBy(asc(operatorBills.created_at));
    for (const b of openBills) {
      if (!earliestOpenBillByDriver.has(b.driver_id)) {
        earliestOpenBillByDriver.set(b.driver_id, b.created_at);
      }
    }

    // Earliest unpaid commission ride per driver (ceiling-locked aging fallback:
    // a completed commission ride whose commission has not been settled carries
    // no operator_bills row yet, so its completed_at is the aging origin).
    const earliestUnpaidRideByDriver = new Map<string, Date>();
    const unpaidRides = await db
      .select({ driver_id: rides.driver_id, completed_at: rides.completed_at })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          eq(rides.monetization_mode_snapshot, 'commission'),
        ),
      )
      .orderBy(asc(rides.completed_at));
    for (const r of unpaidRides) {
      const driverId = r.driver_id as string;
      if (!earliestUnpaidRideByDriver.has(driverId)) {
        earliestUnpaidRideByDriver.set(driverId, r.completed_at!);
      }
    }

    const lockedDrivers: Array<{
      driver_id: string;
      reason: LockReason;
      exposure_paisa: number;
      aged_from: string | null;
      due_at: string | null;
      expires_at: string | null;
    }> = [];
    let registeredDriversNoProduct = 0;

    for (const d of driverRows) {
      const oblig = obligationsByDriver.get(d.id);
      const totalUnpaid = oblig?.totalUnpaid ?? 0;
      const lockoutExposure = oblig?.lockoutExposure ?? 0;
      const hasUsableSub = usableSubDriverIds.has(d.id);
      const hasEnrollment = enrolledDriverIds.has(d.id);
      const latestSub = latestSubByDriver.get(d.id);

      let reason: LockReason | null = null;
      let agedFrom: Date | null = null;
      let dueAt: Date | null = null;
      let expiresAt: Date | null = null;

      // NO_PRODUCT — no subscription row at all and no active enrollment.
      const hasAnySubscription = latestSubByDriver.has(d.id);
      if (!hasAnySubscription && !hasEnrollment) {
        reason = 'no_product';
        agedFrom = d.created_at;
        registeredDriversNoProduct += 1;
      }
      // CEILING_LOCKED — exposure at/above the debt ceiling.
      else if (lockoutExposure >= CEILING_BDT) {
        reason = 'debt_ceiling';
        agedFrom = earliestOpenBillByDriver.get(d.id) ?? earliestUnpaidRideByDriver.get(d.id) ?? null;
      }
      // LAPSED — no enrollment; latest sub expired/exhausted, or >= ৳10 owed
      // with no usable product.
      else if (!hasEnrollment && (
        (latestSub && (latestSub.status === 'expired' || latestSub.calls_remaining === 0)) ||
        (totalUnpaid >= DUST_DUES_BDT && !hasUsableSub)
      )) {
        reason = 'subscription_lapsed';
        agedFrom = latestSub?.expires_at ?? null;
        dueAt = latestSub?.expires_at ?? null;
        expiresAt = latestSub?.expires_at ?? null;
      } else {
        // OWING / PRODUCT_FROZEN / ACTIVE — not dispatch-locked.
        continue;
      }

      lockedDrivers.push({
        driver_id: d.id,
        reason,
        exposure_paisa: lockoutExposure,
        aged_from: iso(agedFrom),
        due_at: iso(dueAt),
        expires_at: iso(expiresAt),
      });
    }

    return Response.json({
      drivers: lockedDrivers,
      registered_drivers_no_product: registeredDriversNoProduct,
    }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/monetization/locked-drivers] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
