/**
 * Item 42 — grant/bill atomicity: a crash between grantSubscriptionOnCredit
 * and createOpenBill inside the shared purchase transaction must leave
 * NEITHER row (full rollback, owner fix, Gate 3). The committed path must
 * leave exactly one active subscription with exactly one open bill — the
 * reconciliation invariant (B2): every active postpaid subscription carries
 * exactly one bill.
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
  driverBills,
  subscriptions,
  drivers,
  fleets,
  users,
  packages,
} from "@/src/db/schema";
import { grantSubscriptionOnCredit } from "@/lib/activateSubscription";
import { createOpenBill } from "@/lib/billsLedger";

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
  const [ok] = await scratch.unsafe<{ driver_bills: unknown }[]>(
    "SELECT to_regclass('public.driver_bills') AS driver_bills",
  );
  if (!ok.driver_bills) {
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

async function counts(driverId: string): Promise<{ subs: number; bills: number; openBills: number }> {
  const [subs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(subscriptions)
    .where(eq(subscriptions.driver_id, driverId));
  const [bills] = await db
    .select({ count: sql<number>`count(*)` })
    .from(driverBills)
    .where(eq(driverBills.driver_id, driverId));
  const [openBills] = await db
    .select({ count: sql<number>`count(*)` })
    .from(driverBills)
    .where(and(eq(driverBills.driver_id, driverId), eq(driverBills.status, "open")));
  return {
    subs: Number(subs?.count ?? 0),
    bills: Number(bills?.count ?? 0),
    openBills: Number(openBills?.count ?? 0),
  };
}

T("Item 42 — crash between grant and bill leaves neither row", async () => {
  const pkg = await seedPackage();
  const d = await seedDriver();

  try {
    await db.transaction(async (tx) => {
      await tx.execute(lock(d.driverId));
      await grantSubscriptionOnCredit(tx, { driverId: d.driverId, package: pkg });
      throw new Error("simulated crash between grant and bill");
    });
  } catch {
    // expected — the crash propagates; the transaction rolls back
  }

  const c = await counts(d.driverId);
  expect(c.subs).toBe(0);
  expect(c.bills).toBe(0);
}, CASE_TIMEOUT_MS);

T("Item 42 — committed grant leaves exactly one active subscription with exactly one open bill", async () => {
  const pkg = await seedPackage();
  const d = await seedDriver();

  await db.transaction(async (tx) => {
    await tx.execute(lock(d.driverId));
    const sub = await grantSubscriptionOnCredit(tx, { driverId: d.driverId, package: pkg });
    await createOpenBill(tx, { driverId: d.driverId, subscriptionId: sub.subscriptionId, amountBdt: pkg.price_bdt, dueAt: new Date(Date.now() + 7 * 86400000) });
  });

  const c = await counts(d.driverId);
  expect(c.subs).toBe(1);
  expect(c.bills).toBe(1);
  expect(c.openBills).toBe(1);
}, CASE_TIMEOUT_MS);
