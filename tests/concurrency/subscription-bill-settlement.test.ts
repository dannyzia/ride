/**
 * Item 43 — subscription-bill settlement: settleSubscriptionBill marks the
 * driver's single open bill settled, stamps payment_event_id, pays the
 * settlement event, and is an idempotent no-op on replay. Subscription
 * settlements reduce total_unpaid_paisa exactly once per event
 * (operator_bills_payment_event_uq); commission settlements never touch
 * operator_bills.
 *
 * Gated: RUN_CONCURRENCY_TESTS=1 + SCRATCH_DATABASE_URL (never shared dev).
 * Default suite: describe.skip, zero connections.
 */
import "../../scripts/_load-env";
import postgresTag from "postgres";
import { requireScratchDbUrl } from "./scratch-db-url";
import { db, recyclePool } from "@/src/db";
import { eq } from "drizzle-orm";
import {
  operatorBills,
  driverCommissionSettlements,
  subscriptions,
  paymentEvents,
  drivers,
  fleets,
  users,
  packages,
} from "@/src/db/schema";
import { settleSubscriptionBill } from "@/lib/billsLedger";
import { getDriverUnpaidObligations } from "@/lib/commissionDues";

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
  const [ok] = await scratch.unsafe<{ operator_bills: unknown; driver_commission_settlements: unknown }[]>(
    "SELECT to_regclass('public.operator_bills') AS operator_bills, " +
      "to_regclass('public.driver_commission_settlements') AS driver_commission_settlements",
  );
  if (!ok.operator_bills || !ok.driver_commission_settlements) {
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
        await tx.delete(driverCommissionSettlements).where(eq(driverCommissionSettlements.driver_id, f.driverId));
        await tx.delete(paymentEvents).where(eq(paymentEvents.driver_id, f.driverId));
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

async function seedBill(driverId: string, amountBdt = 3000): Promise<string> {
  const [bill] = await db
    .insert(operatorBills)
    .values({ operator_id: driverId, operator_role: "driver", subscription_id: null, amount_bdt: amountBdt, status: "open", kind: "subscription_purchase" })
    .returning({ id: operatorBills.id });
  return bill.id;
}

T("Item 43 — settlement settles the bill, stamps the event, pays it; replay is a no-op", async () => {
  const pkgId = await seedPackage();
  const d = await seedDriver();
  await db.insert(subscriptions).values({
    driver_id: d.driverId,
    package_id: pkgId,
    calls_remaining: 5,
    daily_reset_at: new Date(Date.now() + 7 * 86400000),
    status: "active",
    expires_at: new Date(Date.now() + 7 * 86400000),
    credit_calls_received: 0,
    total_deductions: 0,
    is_trial: false,
  });
  const billId = await seedBill(d.driverId, 3000);

  const [evt] = await db
    .insert(paymentEvents)
    .values({
      driver_id: d.driverId,
      idempotency_key: `settle-${billId}`,
      amount_bdt: 3000,
      purpose: "subscription_settlement",
      provider: "portpos",
      status: "initiated",
    })
    .returning({ id: paymentEvents.id });

  const settled = await db.transaction(async (tx) => settleSubscriptionBill(tx, { eventId: evt.id }));
  expect(settled).not.toBeNull();
  expect(settled!.billId).toBe(billId);

  const [bill] = await db.select().from(operatorBills).where(eq(operatorBills.id, billId)).limit(1);
  expect(bill.status).toBe("settled");
  expect(bill.payment_event_id).toBe(evt.id);

  const [eventRow] = await db.select().from(paymentEvents).where(eq(paymentEvents.id, evt.id)).limit(1);
  expect(eventRow.status).toBe("paid");
  expect(eventRow.confirmed_at).not.toBeNull();

  // replay: idempotent no-op
  const replay = await db.transaction(async (tx) => settleSubscriptionBill(tx, { eventId: evt.id }));
  expect(replay).toBeNull();

  const [billAgain] = await db.select().from(operatorBills).where(eq(operatorBills.id, billId)).limit(1);
  expect(billAgain.status).toBe("settled");
  expect(billAgain.payment_event_id).toBe(evt.id);

  // unified figure down to zero
  const obligations = await getDriverUnpaidObligations(db, d.driverId);
  expect(obligations.totalUnpaidPaisa).toBe(0);
  expect(obligations.unpaidSubscriptionPaisa).toBe(0);
}, CASE_TIMEOUT_MS);

T("Item 43 — commission settlements never touch operator_bills", async () => {
  const pkgId = await seedPackage();
  const d = await seedDriver();
  await db.insert(subscriptions).values({
    driver_id: d.driverId,
    package_id: pkgId,
    calls_remaining: 5,
    daily_reset_at: new Date(Date.now() + 7 * 86400000),
    status: "active",
    expires_at: new Date(Date.now() + 7 * 86400000),
    credit_calls_received: 0,
    total_deductions: 0,
    is_trial: false,
  });
  await seedBill(d.driverId, 3000);

  // a commission settlement event, settled through the commission path
  const [evt] = await db
    .insert(paymentEvents)
    .values({
      driver_id: d.driverId,
      idempotency_key: `comm-settle-${Date.now()}`,
      amount_bdt: 1000,
      purpose: "commission_settlement",
      provider: "portpos",
      status: "initiated",
    })
    .returning({ id: paymentEvents.id });
  await db.insert(driverCommissionSettlements).values({
    driver_id: d.driverId,
    payment_event_id: evt.id,
    amount_bdt: 1000,
    status: "completed",
    provider: "portpos",
  });

  const [bills] = await db.select().from(operatorBills).where(eq(operatorBills.operator_id, d.driverId));
  expect(bills.status).toBe("open"); // untouched by the commission settlement

  const obligations = await getDriverUnpaidObligations(db, d.driverId);
  expect(obligations.unpaidSubscriptionPaisa).toBe(3000);
  expect(obligations.totalUnpaidPaisa).toBe(3000);
}, CASE_TIMEOUT_MS);

// ── Batch-2 Item 2: per-operator isolation on the composite one-open slot ──
// operator_bills_one_open_uq is scoped to (operator_role, operator_id): the
// same operator_id may hold independent open slots per role (a shop-role bill
// never 23505s the driver-role slot, and vice versa).
T("Batch-2 Item 2 — per-operator isolation: same operator_id, different roles = independent slots", async () => {
  const d = await seedDriver();

  // Seed two open slots for the SAME operator_id under different roles.
  await scratch.unsafe(
    `INSERT INTO operator_bills (operator_id, operator_role, amount_bdt, status, kind) VALUES ($1, 'driver', 3000, 'open', 'subscription_purchase')`,
    [d.driverId],
  );
  await scratch.unsafe(
    `INSERT INTO operator_bills (operator_id, operator_role, amount_bdt, status, kind) VALUES ($1, 'shop', 5000, 'open', 'subscription_purchase')`,
    [d.driverId],
  );

  // Both slots coexist — the composite index treats them as independent.
  const [count] = await scratch.unsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM operator_bills WHERE operator_id = $1 AND status = 'open'`,
    [d.driverId],
  );
  expect(Number(count.count)).toBe(2);

  // A third open slot for the SAME role collides (23505).
  await expect(
    scratch.unsafe(
      `INSERT INTO operator_bills (operator_id, operator_role, amount_bdt, status, kind) VALUES ($1, 'driver', 1000, 'open', 'subscription_purchase')`,
      [d.driverId],
    ),
  ).rejects.toMatchObject({ code: "23505" });

  // Two distinct operators each get their own slot without interference.
  const other = await seedDriver();
  await scratch.unsafe(
    `INSERT INTO operator_bills (operator_id, operator_role, amount_bdt, status, kind) VALUES ($1, 'driver', 3000, 'open', 'subscription_purchase')`,
    [other.driverId],
  );
  const [both] = await scratch.unsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM operator_bills WHERE operator_id IN ($1, $2) AND status = 'open'`,
    [d.driverId, other.driverId],
  );
  expect(Number(both.count)).toBe(3);
}, CASE_TIMEOUT_MS);
