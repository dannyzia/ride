// [auth-required] GET /api/driver/dues
//
// Itemized driver dues surface for the postpaid monetization rollout
// (DESIGN-POSTPAID-MONETIZATION.md §3.6, Items 17/33). All live figures come
// from the `driver_unpaid_obligations` view (single owed-figure: unpaid
// subscription bills + net commission dues). `total_outstanding_bdt` and
// `revenue_model` are retained as deprecated stubs (M-04) until the client
// rollout floor passes; `monetization_state` carries the six-server-state
// precedence (NO_PRODUCT > CEILING_LOCKED > LAPSED > OWING > PRODUCT_FROZEN >
// ACTIVE — PURCHASE_BLOCKED is client-side on the typed 409).
import { z } from "zod";
import { db } from "@/src/db";
import {
  users,
  drivers,
  subscriptions,
  packages,
  driverBills,
  commissionEnrollments,
} from "@/src/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { getDriverUnpaidObligations } from "@/lib/commissionDues";
import { getMaxCommissionDebtBdt, getRevenueModel } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

type MonetizationState =
  | 'NO_PRODUCT'
  | 'CEILING_LOCKED'
  | 'LAPSED'
  | 'OWING'
  | 'PRODUCT_FROZEN'
  | 'ACTIVE';

interface OpenBill {
  id: string;
  amount_bdt: number;
  due_at: Date | null;
}

interface SubRow {
  id: string;
  status: string;
  calls_remaining: number | null;
  expires_at: Date | null;
  frozen_at: Date | null;
  package_name: string | null;
}

const DUST_DUES_BDT = 1_000; // PortPos settlement minimum — below this is dust

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    // All subscriptions for this driver, latest first — feeds the LAPSED
    // predicate (latest-created row), active_subscription (usable), and
    // frozen_subscription (frozen-but-usable calls widget).
    const allSubs: SubRow[] = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        calls_remaining: subscriptions.calls_remaining,
        expires_at: subscriptions.expires_at,
        frozen_at: subscriptions.frozen_at,
        package_name: packages.name,
      })
      .from(subscriptions)
      .leftJoin(packages, eq(subscriptions.package_id, packages.id))
      .where(eq(subscriptions.driver_id, driver.id))
      .orderBy(desc(subscriptions.created_at));

    // Single active commission enrollment (one-active index guarantees <= 1).
    // D3-B-r2: expires_at participates in the state machine — an enrollment
    // whose expiry has passed is NOT a usable product and lands the driver in
    // LAPSED (§3.6 item 3).
    const [enrollment] = await db
      .select({
        id: commissionEnrollments.id,
        expires_at: commissionEnrollments.expires_at,
      })
      .from(commissionEnrollments)
      .where(
        and(
          eq(commissionEnrollments.driver_id, driver.id),
          eq(commissionEnrollments.status, 'active'),
        ),
      )
      .limit(1);
    const hasCommissionEnrollment = Boolean(enrollment);

    // Open subscription-purchase bills (itemized).
    const openBills = await db
      .select({
        id: driverBills.id,
        amount_bdt: driverBills.amount_bdt,
        due_at: driverBills.due_at,
      })
      .from(driverBills)
      .where(
        and(
          eq(driverBills.driver_id, driver.id),
          eq(driverBills.status, 'open'),
          eq(driverBills.kind, 'subscription_purchase'),
        ),
      )
      .orderBy(desc(driverBills.created_at));

    const now = new Date();
    const usableSub = allSubs.find(
      (s) => s.status === 'active' &&
        s.frozen_at == null &&
        (s.expires_at ? new Date(s.expires_at) > now : false) &&
        (s.calls_remaining === -1 || (s.calls_remaining ?? 0) > 0),
    );
    const frozenSub = allSubs.find(
      (s) => s.frozen_at != null &&
        (s.expires_at ? new Date(s.expires_at) > now : false) &&
        (s.calls_remaining ?? 0) > 0,
    );
    const latestSub = allSubs[0];

    // D3-B-r2: enrollment expiry state — an active enrollment whose
    // expires_at has passed is NOT a usable product.
    const enrollmentUsable = hasCommissionEnrollment &&
      (!enrollment || enrollment.expires_at == null || new Date(enrollment.expires_at) > now);
    const enrollmentExpired = hasCommissionEnrollment && enrollment != null &&
      enrollment.expires_at != null && new Date(enrollment.expires_at) <= now;

    // Single owed-figure from the view (canonical total).
    const obligations = await getDriverUnpaidObligations(db, driver.id);
    const totalUnpaid = obligations.totalUnpaidPaisa;
    const lockoutExposure = obligations.lockoutExposurePaisa;

    const revenueModel = await getRevenueModel();
    const ceiling = await getMaxCommissionDebtBdt();

    // ── Six-state monetization_state (strict priority) ────────────────────
    let state: MonetizationState = 'ACTIVE';
    let lockReason: string | null = null;

    if (allSubs.length === 0 && !hasCommissionEnrollment) {
      // 1. NO_PRODUCT — no subscription row at all and no active enrollment.
      state = 'NO_PRODUCT';
      lockReason = 'no_product';
    } else if (lockoutExposure >= ceiling) {
      // 2. CEILING_LOCKED — exposure at/above the debt ceiling.
      state = 'CEILING_LOCKED';
      lockReason = 'debt_ceiling';
    } else if (enrollmentExpired || (!enrollmentUsable && (
      (latestSub && (latestSub.status === 'expired' || latestSub.calls_remaining === 0)) ||
      (totalUnpaid >= DUST_DUES_BDT && !usableSub)
    ))) {
      // 3. LAPSED — no usable product: latest sub expired/exhausted, >= ৳10
      //    owed with no usable product, or D3-B-r2 expired enrollment.
      state = 'LAPSED';
      lockReason = 'subscription_lapsed';
    } else if (usableSub && totalUnpaid >= DUST_DUES_BDT && totalUnpaid < ceiling) {
      // 4. OWING — usable product held, owe >= ৳10 but below ceiling.
      state = 'OWING';
    } else if (enrollmentUsable && frozenSub && totalUnpaid < DUST_DUES_BDT) {
      // 5. PRODUCT_FROZEN — usable enrollment + frozen usable sub, no debt.
      state = 'PRODUCT_FROZEN';
    } else {
      // 6. ACTIVE — usable product (or pure commission mode) with no debt.
      state = 'ACTIVE';
    }

    const isLocked = revenueModel !== 'subscription_only' && totalUnpaid >= ceiling;

    // Credit headroom before the ceiling lockout (floored at zero — dust never
    // strands; sub-৳10 rolls into the next payable settlement).
    const headroom = Math.max(0, ceiling - lockoutExposure);
    const ceilingWarn = ceiling > 0 && lockoutExposure >= ceiling * 0.8;
    const callsWarn = Boolean(usableSub &&
      usableSub.calls_remaining !== null &&
      usableSub.calls_remaining !== -1 &&
      usableSub.calls_remaining <= 2);

    const activeSub = usableSub;
    const expiresIso = (d: Date | null) => (d ? d.toISOString() : null);

    return Response.json({
      subscription: activeSub
        ? {
            package_name: activeSub.package_name,
            expires_at: expiresIso(activeSub.expires_at),
            calls_remaining: activeSub.calls_remaining,
            status: activeSub.status,
          }
        : null,
      active_subscription: activeSub
        ? { id: activeSub.id, calls_remaining: activeSub.calls_remaining, expires_at: expiresIso(activeSub.expires_at) }
        : null,
      frozen_subscription: frozenSub
        ? { id: frozenSub.id, calls_remaining: frozenSub.calls_remaining, expires_at: expiresIso(frozenSub.expires_at) }
        : null,
      revenue_model: revenueModel, // deprecated stub — retained (M-04)
      monetization_state: state,
      open_bills: openBills.map((b) => ({
        id: b.id,
        amount_bdt: b.amount_bdt,
        due_at: expiresIso(b.due_at),
      })),
      commission_accrued_bdt: obligations.netCommissionPaisa,
      commission_settled_bdt: obligations.netCommissionPaisa, // Stage 1: view exposes net only
      commission_due_bdt: totalUnpaid,
      total_unpaid_paisa: totalUnpaid,
      total_outstanding_bdt: totalUnpaid, // deprecated alias — retained (M-04)
      max_debt_limit_bdt: ceiling,
      credit_headroom_paisa: headroom,
      is_dispatch_locked: isLocked,
      dispatch_lock_reason: lockReason,
      warning_flags: {
        ceiling_80pct: ceilingWarn,
        calls_low: callsWarn,
      },
    }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/dues] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
