/**
 * Item 41 — settle-first purchase at lib level: two concurrent purchases for
 * the same driver (distinct idempotency claims) serialize on the driver
 * advisory lock; exactly one grant+bill commits; the loser is blocked by the
 * operator_bills one-open-slot barrier.
 *
 * Two scenarios:
 *   A. route contract — lock, recheck for an open bill, then grant+bill:
 *      exactly one fulfills; the other rejects BillSlotConflictError from the
 *      recheck. Final state: exactly one active subscription + one open bill.
 *   B. direct createOpenBill twice (no grant) — the 23505 path: exactly one
 *      bill inserts; the loser takes operator_bills_one_open_uq →
 *      BillSlotConflictError (pinned typed barrier).
 *
 * The route-layer mapping (BillSlotConflictError -> 409
 * dues_outstanding_purchase_blocked) lands with the purchase route
 * (Stage 3, Item 16 / IR-A15); this harness pins the typed barrier and the
 * exactly-one semantics at the lib layer Stage 1 owns.
 *
 * Gated: RUN_CONCURRENCY_TESTS=1 + SCRATCH_DATABASE_URL (never shared dev).
 * Default suite: describe.skip, zero connections.
 */
import "../../scripts/_load-env";
import postgresTag from "postgres";
import { requireScratchDbUrl } from "./scratch-db-url";
import { db, recyclePool } from "@/src/db";
import { and, eq, sql } from "drizzle-orm";
import {
  operatorBills,
  subscriptions,
  drivers,
  fleets,
  users,
  packages,
} from "@/src/db/schema";
import { grantSubscriptionOnCredit } from "@/lib/activateSubscription";
import { createOpenBill, BillSlotConflictError } from "@/lib/billsLedger";

const RUN = process.env.RUN_CONCURRENCY_TESTS === "1";
const T = RUN ? it : it.skip;
const DB_URL = process.env.SCRATCH_DATABASE_URL || process.env.DATABASE_URL;
const ORIG_DB_URL = process.env.DATABASE_URL;
const CASE_TIMEOUT_MS = 60000;

let scratch: ReturnType<typeof postgresTag>;
const dirt: { driverId: string; userId: string }[] = [];

beforeAll(async () => {
  requireScratchDbUrl();
  scratch = postgresTag(DB_URL!, { max: 4, connect_timeout: 15 });
  const [ok] = await scratch.unsafe<{ operator_bills: unknown }[]>(
    "SELECT to_regclass('public.operator_bills') AS operator_bills",
  );
  if (!ok.operator_bills) {
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
        await tx.delete(operatorBills).where(eq(operatorBills.operator_id, f.driverId));
        await tx.delete(subscriptions).where(eq(subscriptions.driver_id, f.driverId));
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

async function seedPackage(): Promise<typeof packages.$inferSelect> {
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
    .returning();
  return pkg;
}

const lock = (driverId: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext('purchase_bill_${driverId}'))`;

/** Route-contract purchase inside the driver advisory lock: recheck first,
 * then grant+bill. Mirrors what the Stage 3 purchase route does under lock. */
async function purchaseTx(
  driverId: string,
  pkg: typeof packages.$inferSelect,
): Promise<{ billId: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(lock(driverId));
    const [open] = await tx
      .select({ id: operatorBills.id })
      .from(operatorBills)
      .where(and(eq(operatorBills.operator_id, driverId), eq(operatorBills.status, "open"), eq(operatorBills.kind, "subscription_purchase")))
      .limit(1);
    if (open) throw new BillSlotConflictError();
    const sub = await grantSubscriptionOnCredit(tx, { driverId, package: pkg });
    const bill = await createOpenBill(tx, {
      operatorRole: 'driver',
      operatorId: driverId,
      packageId: pkg.id,
      subscriptionId: sub.subscriptionId,
      amountBdt: pkg.price_bdt,
      dueAt: new Date(Date.now() + 7 * 86400000),
    });
    return { billId: bill.id };
  });
}

T("Item 41A — two concurrent purchases, one driver: exactly one grant+bill commits", async () => {
  const pkg = await seedPackage();
  const d = await seedDriver();

  const outcomes = await Promise.allSettled([purchaseTx(d.driverId, pkg), purchaseTx(d.driverId, pkg)]);
  const settled = outcomes.filter((o) => o.status === "fulfilled");
  const rejected = outcomes.filter((o) => o.status === "rejected");

  expect(settled.length).toBe(1);
  expect(rejected.length).toBe(1);
  expect((rejected[0] as PromiseRejectedResult).reason).toEqual(expect.any(BillSlotConflictError));

  const [bills] = await db
    .select({ count: sql<number>`count(*)` })
    .from(operatorBills)
    .where(eq(operatorBills.operator_id, d.driverId));
  const [subs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(subscriptions)
    .where(and(eq(subscriptions.driver_id, d.driverId), eq(subscriptions.status, "active")));
  expect(Number(bills?.count ?? 0)).toBe(1);
  expect(Number(subs?.count ?? 0)).toBe(1);
}, CASE_TIMEOUT_MS);

T("Item 41B — two concurrent createOpenBill calls: exactly one bill, 23505 -> BillSlotConflictError", async () => {
  const pkg = await seedPackage();
  const d = await seedDriver();
  const subId = (await db.insert(subscriptions).values({
    driver_id: d.driverId,
    package_id: pkg.id,
    calls_remaining: 5,
    daily_reset_at: new Date(Date.now() + 7 * 86400000),
    status: "active",
    expires_at: new Date(Date.now() + 7 * 86400000),
    credit_calls_received: 0,
    total_deductions: 0,
    is_trial: false,
  }).returning({ id: subscriptions.id }))[0].id;

  const a = scratch.begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext('purchase_bill_${d.driverId}'))`);
    return tx.unsafe(
      `INSERT INTO operator_bills (operator_id, operator_role, subscription_id, amount_bdt, status, kind) VALUES ($1, 'driver', $2, $3, 'open', 'subscription_purchase') RETURNING id`,
      [d.driverId, subId, pkg.price_bdt],
    );
  });
  const b = scratch.begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext('purchase_bill_${d.driverId}'))`);
    return tx.unsafe(
      `INSERT INTO operator_bills (operator_id, operator_role, subscription_id, amount_bdt, status, kind) VALUES ($1, 'driver', $2, $3, 'open', 'subscription_purchase') RETURNING id`,
      [d.driverId, subId, pkg.price_bdt],
    );
  });
  const settled = await Promise.allSettled([a, b]);
  const fulfilled = settled.filter((o) => o.status === "fulfilled");
  const rejected = settled.filter((o) => o.status === "rejected");
  expect(fulfilled.length).toBe(1);
  expect(rejected.length).toBe(1);
  expect(((rejected[0] as PromiseRejectedResult).reason as { code?: string } | undefined)?.code).toBe("23505");

  const [count] = await scratch.unsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM operator_bills WHERE operator_id = $1 AND status = 'open'`,
    [d.driverId],
  );
  expect(Number(count.count)).toBe(1);
}, CASE_TIMEOUT_MS);
