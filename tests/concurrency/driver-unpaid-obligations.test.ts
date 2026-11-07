/**
 * Item 40 — `driver_unpaid_obligations` (migration 0092): the raw VIEW SQL,
 * the canonical lib function `getDriverUnpaidObligations`, and the batched
 * dispatch query shape (`WHERE driver_id = ANY($1)`, Stage 2 consumption)
 * must return IDENTICAL figures for the same fixture — all five figures,
 * for both a self-bill driver (usable subscription + open bill) and a
 * debt-only driver (expired subscription + open bill, no self-bill).
 *
 * Gated: RUN_CONCURRENCY_TESTS=1 + SCRATCH_DATABASE_URL — never the shared
 * dev project (tests/concurrency/scratch-db-url.ts). Default suite:
 * describe.skip, zero connections (tests/meta/concurrency-gate.test.ts).
 * Requires Stage 1 schema applied on the scratch DB (drizzle-kit push).
 */
import "../../scripts/_load-env";
import postgresTag from "postgres";
import { requireScratchDbUrl } from "./scratch-db-url";
import { db, recyclePool } from "@/src/db";
import { eq } from "drizzle-orm";
import {
  driverBills,
  subscriptions,
  paymentEvents,
  drivers,
  fleets,
  users,
  packages,
} from "@/src/db/schema";
import { getDriverUnpaidObligations } from "@/lib/commissionDues";
import { nextBdtMidnightUtc } from "@/lib/time";

const RUN = process.env.RUN_CONCURRENCY_TESTS === "1";
const T = RUN ? it : it.skip;
const DB_URL = process.env.SCRATCH_DATABASE_URL || process.env.DATABASE_URL;
const ORIG_DB_URL = process.env.DATABASE_URL;
const CASE_TIMEOUT_MS = 60000;

const OBLIG_COLUMNS =
  "driver_id, unpaid_subscription_paisa, net_commission_paisa, total_unpaid_paisa, active_self_bill_paisa, lockout_exposure_paisa";
type ObligationRow = {
  driver_id: string;
  unpaid_subscription_paisa: string;
  net_commission_paisa: string;
  total_unpaid_paisa: string;
  active_self_bill_paisa: string;
  lockout_exposure_paisa: string;
};
const num = (v: unknown) => Number(v ?? 0);

let scratch: ReturnType<typeof postgresTag>;
const dirt: { driverId: string; userId: string }[] = [];

beforeAll(async () => {
  requireScratchDbUrl();
  scratch = postgresTag(DB_URL!, { max: 4, connect_timeout: 15 });
  const [ok] = await scratch.unsafe<{ driver_bills: unknown; commission_enrollments: unknown; driver_unpaid_obligations: unknown }[]>(
    "SELECT to_regclass('public.driver_bills') AS driver_bills, " +
      "to_regclass('public.commission_enrollments') AS commission_enrollments, " +
      "to_regclass('public.driver_unpaid_obligations') AS driver_unpaid_obligations",
  );
  if (!ok.driver_bills || !ok.commission_enrollments || !ok.driver_unpaid_obligations) {
    throw new Error(
      "Stage 1 schema objects are missing on SCRATCH_DATABASE_URL — run drizzle-kit push against it first",
    );
  }
  process.env.DATABASE_URL = DB_URL;
  recyclePool();
}, 120000);

afterAll(async () => {
  process.env.DATABASE_URL = ORIG_DB_URL;
  await scratch?.end({ timeout: 5 }).catch(() => {});
}, 120000);

afterEach(async () => {
  for (const f of dirt) {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(driverBills).where(eq(driverBills.driver_id, f.driverId));
        await tx.delete(subscriptions).where(eq(subscriptions.driver_id, f.driverId));
        await tx.delete(paymentEvents).where(eq(paymentEvents.driver_id, f.driverId));
        await tx.delete(drivers).where(eq(drivers.id, f.driverId));
        await tx.delete(users).where(eq(users.id, f.userId));
      });
    } catch {
      // best-effort teardown
    }
  }
  dirt.length = 0;
});

async function seedDriver(): Promise<{ driverId: string; userId: string }> {
  const suf = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const [user] = await db
    .insert(users)
    .values({ auth_uid: `auth-${suf}`, phone: `+88017${Number(Date.now()) % 10 ** 8}${suf.slice(-2)}`, name: "Conc Test" })
    .returning({ id: users.id });
  const [fleet] = await db.insert(fleets).values({ owner_user_id: user.id, name: `conc-fleet-${suf}` }).returning({ id: fleets.id });
  const [driver] = await db
    .insert(drivers)
    .values({ user_id: user.id, fleet_id: fleet.id, vehicle_type: "bike_basic", status: "active" })
    .returning({ id: drivers.id });
  dirt.push({ driverId: driver.id, userId: user.id });
  return { driverId: driver.id, userId: user.id };
}

async function seedPackage(): Promise<string> {
  const suf = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const [pkg] = await db
    .insert(packages)
    .values({
      name: `conc-pkg-${suf}`,
      code: `pkg-${suf}`,
      call_count: 5,
      duration_days: 30,
      price_bdt: 5000,
      is_trial: false,
      is_active: true,
      daily_cap: 0,
      vehicle_type: null,
      roles: ["driver"],
      product_type: "call_package",
    })
    .returning({ id: packages.id });
  return pkg.id;
}

async function seedSubscription(driverId: string, pkgId: string, usable: boolean): Promise<string> {
  const [sub] = await db
    .insert(subscriptions)
    .values({
      driver_id: driverId,
      package_id: pkgId,
      calls_remaining: usable ? 5 : 0,
      daily_reset_at: nextBdtMidnightUtc(),
      status: "active",
      expires_at: usable ? new Date(Date.now() + 7 * 86400000) : new Date(Date.now() - 86400000),
      credit_calls_received: 0,
      total_deductions: 0,
      is_trial: false,
    })
    .returning({ id: subscriptions.id });
  return sub.id;
}

async function seedBill(driverId: string, subscriptionId: string | null, amountBdt = 3000): Promise<void> {
  await db.insert(driverBills).values({
    driver_id: driverId,
    subscription_id: subscriptionId,
    amount_bdt: amountBdt,
    status: "open",
    kind: "subscription_purchase",
  });
}

async function viaView(driverId: string): Promise<ObligationRow> {
  const rows = await scratch.unsafe<ObligationRow[]>(
    `SELECT ${OBLIG_COLUMNS} FROM driver_unpaid_obligations WHERE driver_id = $1`,
    [driverId],
  );
  return rows[0];
}

async function viaLib(driverId: string) {
  const o = await getDriverUnpaidObligations(db, driverId);
  return {
    driver_id: driverId,
    unpaid_subscription_paisa: String(o.unpaidSubscriptionPaisa),
    net_commission_paisa: String(o.netCommissionPaisa),
    total_unpaid_paisa: String(o.totalUnpaidPaisa),
    active_self_bill_paisa: String(o.activeSelfBillPaisa),
    lockout_exposure_paisa: String(o.lockoutExposurePaisa),
  };
}

async function viaBatched(driverId: string): Promise<ObligationRow> {
  const rows = await scratch.unsafe<ObligationRow[]>(
    `SELECT ${OBLIG_COLUMNS} FROM driver_unpaid_obligations WHERE driver_id = ANY($1)`,
    [[driverId]],
  );
  return rows[0];
}

T("Item 40 — view, lib function, and batched dispatch shape agree on all five figures", async () => {
  const pkgId = await seedPackage();

  // d1: usable subscription + open bill -> self-bill = bill, lockout exposure = 0
  const d1 = await seedDriver();
  const sub1 = await seedSubscription(d1.driverId, pkgId, true);
  await seedBill(d1.driverId, sub1, 3000);

  // d2: expired subscription + open bill, no subscription link -> self-bill = 0, lockout = bill
  const d2 = await seedDriver();
  await seedSubscription(d2.driverId, pkgId, false);
  await seedBill(d2.driverId, null, 3000);

  const expected: Record<string, Partial<ObligationRow>> = {
    [d1.driverId]: {
      unpaid_subscription_paisa: "3000",
      net_commission_paisa: "0",
      total_unpaid_paisa: "3000",
      active_self_bill_paisa: "3000",
      lockout_exposure_paisa: "0",
    },
    [d2.driverId]: {
      unpaid_subscription_paisa: "3000",
      net_commission_paisa: "0",
      total_unpaid_paisa: "3000",
      active_self_bill_paisa: "0",
      lockout_exposure_paisa: "3000",
    },
  };

  for (const driverId of [d1.driverId, d2.driverId]) {
    const [a, b, c] = await Promise.all([viaView(driverId), viaLib(driverId), viaBatched(driverId)]);
    const exp = expected[driverId];
    const check = (got: ObligationRow, label: string) => {
      expect(num(got.unpaid_subscription_paisa)).toBe(num(exp.unpaid_subscription_paisa));
      expect(num(got.net_commission_paisa)).toBe(num(exp.net_commission_paisa));
      expect(num(got.total_unpaid_paisa)).toBe(num(exp.total_unpaid_paisa));
      expect(num(got.active_self_bill_paisa)).toBe(num(exp.active_self_bill_paisa));
      expect(num(got.lockout_exposure_paisa)).toBe(num(exp.lockout_exposure_paisa));
    };
    check(a, "view");
    check(b, "lib");
    check(c, "batched");
  }
}, CASE_TIMEOUT_MS);
