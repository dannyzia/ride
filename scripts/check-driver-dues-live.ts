/**
 * Live (opt-in) end-to-end check for GET /api/driver/dues against a real database.
 *
 * **Purpose:**   Prove the commission dues ledger reported by the route matches
 *                real rows — accrued from completed rides, settled from
 *                driver_commission_settlements — and that the dispatch lockout
 *                follows platform_config.revenue_model without a restart.
 * **Owner:**     Coding model
 * **Status:**    ACTIVE
 * **Source of truth:**
 *                app/api/driver/dues+api.ts (response contract),
 *                lib/commissionDues.ts (accrual/settlement math).
 * **Related (concrete paths):**
 *   - app/api/driver/dues+api.ts — the handler this script calls in-process.
 *   - lib/commissionDues.ts — computeDriverCommissionDues (accrued/settled/due).
 *   - lib/platformConfig.ts — getRevenueModel / getMaxCommissionDebtBdt.
 *   - src/db/migrations/0090_driver_commission_settlements.sql — the table seeded.
 *   - tests/api/driver/commission-settlement.test.ts — mocked-db unit coverage.
 * **Last verified:** 2026-11-06, coding model, live run against the dev DB
 *                (seeded 62,344 paisa accrued / 5,000 paid; 20/20 assertions
 *                pass, zero residue).
 * **How to update:** keep the assertions in step with the route's response
 *                fields; never remove the cleanup/finally block.
 *
 * Runs against whatever DATABASE_URL resolves (`.env.local` first). It WRITES to
 * that database and then removes everything it wrote, but because it seeds real
 * rows and briefly flips `platform_config.revenue_model` it is deliberately
 * opt-in and never wired into CI:
 *
 *   RUN_LIVE_DUES_CHECK=1 npx tsx scripts/check-driver-dues-live.ts
 *   (Windows PowerShell: $env:RUN_LIVE_DUES_CHECK=1; npx tsx scripts/check-driver-dues-live.ts)
 *
 * What it seeds, for one active driver that has a Supabase auth user with an email:
 *   - 1 completed ride carrying `platform_commission_bdt` above the debt ceiling
 *     ...
 *   - 1 `payment_events` row (`purpose='commission_settlement'`) + 1 matching
 *     `driver_commission_settlements` row, so net due is accrued minus paid.
 *
 * It then calls the REAL route handler with a REAL Supabase session token minted
 * via `auth.admin.generateLink` -> `verifyOtp` (no password change, no new auth
 * user, no email sent) and asserts:
 *   1. unauthenticated GET is 401 (the auth boundary is real);
 *   2. accrued/settled/due/total_outstanding/max_debt_limit equal the seeded math;
 *   3. under the configured model, lockout matches `due >= ceiling` for
 *      commission-gated models and is always false for `subscription_only`;
 *   4. after flipping the config to `hybrid` (no restart) the driver locks, and
 *      back on `subscription_only` it unlocks;
 *   5. every seeded row is gone and the original config value is restored.
 *
 * Exit code 0 = all assertions pass; 1 = failure (message names the assertion).
 * Cleanup always runs, including on failure, and its result is itself asserted.
 */

import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

// Loaded after the (env-free) static imports and before any module that reads
// process.env — the route itself is imported dynamically once seeding is done.
dotenv.config({ path: ".env.local" });

const OPT_IN_ENV = "RUN_LIVE_DUES_CHECK";

const SEED_SETTLEMENT_BDT = 5_000;
const SEED_SURPLUS_OVER_CEILING_BDT = 12_344;
const PROBE_MAX_DEBT_KEY = "max_commission_debt_bdt";
const REVENUE_MODEL_KEY = "revenue_model";
const GATED_MODELS = ["hybrid"];

type DuesResponse = {
  subscription: { package_name: string | null; status: string } | null;
  revenue_model: string;
  commission_accrued_bdt: number;
  commission_settled_bdt: number;
  commission_due_bdt: number;
  total_outstanding_bdt: number;
  max_debt_limit_bdt: number;
  is_dispatch_locked: boolean;
};

type PickedDriver = {
  driver_id: string;
  auth_uid: string;
  email: string;
  completed_rides: number;
};

let sql: ReturnType<typeof postgres> | null = null;

let seededRideId: string | null = null;
let seededPaymentEventId: string | null = null;
let seededSettlementId: string | null = null;
let paymentEventKey: string | null = null;
let originalModel: string | null = null;
let originalCeiling: number | null = null;
let configTouched = false;

let passed = 0;
let failed = 0;

function expect(condition: boolean, label: string, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${label}`);
    return;
  }
  failed += 1;
  console.error(
    `FAIL: ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
}

function describeTarget(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function usage(): void {
  console.error(
    [
      "This check seeds and deletes real rows in the database DATABASE_URL points at.",
      "It is opt-in and never runs from CI. To run it:",
      "",
      `  RUN_LIVE_DUES_CHECK=1 npx tsx scripts/check-driver-dues-live.ts`,
      "",
      "(Windows PowerShell: $env:RUN_LIVE_DUES_CHECK=1; npx tsx scripts/check-driver-dues-live.ts)",
    ].join("\n"),
  );
}

async function pickDriver(db: ReturnType<typeof postgres>): Promise<PickedDriver> {
  const rows = (await db`
    select d.id as driver_id, u.auth_uid, au.email,
           (select count(*)::int from rides r
              where r.driver_id = d.id and r.status = 'completed') as completed_rides
    from drivers d
    join users u on u.id = d.user_id
    -- Seeded admin/back-office users carry non-UUID auth_uid placeholders, so the
    -- cast is guarded by a CASE: postgres would otherwise evaluate ::uuid on those
    -- rows before the join could filter them out.
    join auth.users au on au.id = case
      when u.auth_uid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then u.auth_uid::uuid
    end
    where d.status = 'active'
      and au.email is not null
      and u.auth_uid is not null
    order by completed_rides desc, d.created_at asc
    limit 1
  `) as unknown as PickedDriver[];

  const driver = rows[0];
  if (!driver) {
    throw new Error(
      "no active driver with a Supabase auth user that has an email — cannot mint a session to call the route",
    );
  }
  return driver;
}

async function seedCompletedRide(
  db: ReturnType<typeof postgres>,
  driverId: string,
  commissionBdt: number,
): Promise<{ rideId: string; overrodeDriver: boolean }> {
  const own = (await db`
    select id from rides
    where driver_id = ${driverId} and status = 'completed'
    limit 1
  `) as unknown as { id: string }[];

  let sourceId = own[0]?.id;
  let overrodeDriver = false;

  if (!sourceId) {
    const anyRide = (await db`
      select id from rides where status = 'completed' limit 1
    `) as unknown as { id: string }[];
    sourceId = anyRide[0]?.id;
    overrodeDriver = true;
  }
  if (!sourceId) {
    throw new Error(
      "no completed ride exists to clone — insert one completed ride first so the seed inherits valid zone/pricing FKs",
    );
  }

  const rideId = randomUUID();
  const driverOverride = overrodeDriver
    ? `'driver_id', ${driverId}::text,`
    : "";

  // jsonb_populate_record copies every column from the source row and overlays
  // the fields we control; the source row itself is never written.
  await db.unsafe(
    `
    insert into rides
    select (jsonb_populate_record(null::rides,
      to_jsonb(r) || jsonb_build_object(
        'id', $1::text,
        ${driverOverride}
        'platform_commission_bdt', $2::int,
        'created_at', now(),
        'completed_at', now()
      ))).*
    from rides r
    where r.id = $3
    `,
    [rideId, commissionBdt, sourceId],
  );

  return { rideId, overrodeDriver };
}

async function mintSessionToken(email: string): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set (in .env.local or the environment) to mint a session",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashedToken = link?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    throw new Error(`generateLink failed: ${linkError?.message ?? "no hashed_token returned"}`);
  }

  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });
  const token = verified?.session?.access_token;
  if (verifyError || !token) {
    throw new Error(`verifyOtp failed: ${verifyError?.message ?? "no session returned"}`);
  }

  return token;
}

async function callDuesRoute(token?: string): Promise<{ status: number; body: unknown }> {
  const route = (await import("@/app/api/driver/dues+api")) as {
    GET: (request: Request) => Promise<Response>;
  };
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await route.GET(
    new Request("http://localhost/api/driver/dues", { headers }),
  );
  return { status: response.status, body: await response.json() };
}

function isGated(model: string): boolean {
  return GATED_MODELS.includes(model);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (expected in .env.local or the environment)");
  }

  sql = postgres(databaseUrl, {
    ssl: /^(localhost|127\.0\.0\.1)/.test(describeTarget(databaseUrl)) ? false : "require",
    max: 1,
    onnotice: () => {},
  });
  const db = sql;
  console.log(`target database: ${describeTarget(databaseUrl)}`);

  const driver = await pickDriver(db);
  console.log(
    `driver: ${driver.driver_id} (${driver.completed_rides} completed rides, session user has email)`,
  );

  const configRows = (await db`
    select key, value from platform_config
    where key in (${REVENUE_MODEL_KEY}, ${PROBE_MAX_DEBT_KEY})
  `) as unknown as { key: string; value: string }[];
  const config = new Map(configRows.map((row) => [row.key, row.value]));

  originalModel = config.get(REVENUE_MODEL_KEY) ?? "subscription_only";
  originalCeiling = Number(config.get(PROBE_MAX_DEBT_KEY) ?? "0");

  if (!Number.isFinite(originalCeiling) || originalCeiling <= 0) {
    throw new Error(
      `platform_config.${PROBE_MAX_DEBT_KEY} is ${config.get(PROBE_MAX_DEBT_KEY) ?? "absent"} — commission lockout is disabled at a non-positive ceiling, so lockout cannot be exercised`,
    );
  }

  const commissionBdt = originalCeiling + SEED_SURPLUS_OVER_CEILING_BDT;
  console.log(
    `config: model=${originalModel} ceiling=${originalCeiling} paisa; seeding commission=${commissionBdt} paisa, settled=${SEED_SETTLEMENT_BDT} paisa`,
  );

  const baseline = (await db`
    select
      (select coalesce(sum(r.platform_commission_bdt), 0)::int from rides r
         where r.driver_id = ${driver.driver_id} and r.status = 'completed') as accrued,
      (select coalesce(sum(s.amount_bdt), 0)::int from driver_commission_settlements s
         where s.driver_id = ${driver.driver_id} and s.status = 'completed') as settled
  `) as unknown as { accrued: number; settled: number }[];
  const accruedBefore = baseline[0].accrued;
  const settledBefore = baseline[0].settled;
  console.log(`baseline: accrued=${accruedBefore} settled=${settledBefore}`);

  // ---- seed ---------------------------------------------------------------
  const seededRide = await seedCompletedRide(db, driver.driver_id, commissionBdt);
  seededRideId = seededRide.rideId;

  paymentEventKey = `probe_dues_live_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const paymentEvent = (await db`
    insert into payment_events (idempotency_key, provider, amount_bdt, purpose, driver_id)
    values (${paymentEventKey}, 'portpos', ${SEED_SETTLEMENT_BDT}, 'commission_settlement', ${driver.driver_id})
    returning id
  `) as unknown as { id: string }[];
  seededPaymentEventId = paymentEvent[0].id;

  const settlement = (await db`
    insert into driver_commission_settlements (driver_id, payment_event_id, amount_bdt)
    values (${driver.driver_id}, ${seededPaymentEventId}, ${SEED_SETTLEMENT_BDT})
    returning id
  `) as unknown as { id: string }[];
  seededSettlementId = settlement[0].id;

  console.log(
    `seeded ride=${seededRideId}${seededRide.overrodeDriver ? " (driver overridden from another driver's completed ride)" : ""} payment_event=${seededPaymentEventId} settlement=${seededSettlementId}`,
  );

  const token = await mintSessionToken(driver.email);
  console.log("minted a real Supabase session token (no password change, no email sent)");

  // ---- assertion 1: auth boundary ----------------------------------------
  const anonymous = await callDuesRoute();
  expect(anonymous.status === 401, "unauthenticated GET is rejected with 401", anonymous);

  // ---- assertion 2: net dues math ----------------------------------------
  const expectedAccrued = accruedBefore + commissionBdt;
  const expectedSettled = settledBefore + SEED_SETTLEMENT_BDT;
  const expectedDue = Math.max(0, expectedAccrued - expectedSettled);

  const under = await callDuesRoute(token);
  expect(under.status === 200, "authenticated GET returns 200", under);
  const dues = under.body as DuesResponse;
  console.log("GET /api/driver/dues ->", JSON.stringify(dues));

  expect(
    dues.commission_accrued_bdt === expectedAccrued,
    `commission_accrued_bdt = baseline + ${commissionBdt}`,
    dues,
  );
  expect(
    dues.commission_settled_bdt === expectedSettled,
    `commission_settled_bdt = baseline + ${SEED_SETTLEMENT_BDT}`,
    dues,
  );
  expect(
    dues.commission_due_bdt === expectedDue,
    `commission_due_bdt = accrued - settled (${expectedDue})`,
    dues,
  );
  expect(
    dues.total_outstanding_bdt === expectedDue,
    "total_outstanding_bdt equals due",
    dues,
  );
  expect(
    dues.max_debt_limit_bdt === originalCeiling,
    `max_debt_limit_bdt = platform_config ceiling (${originalCeiling})`,
    dues,
  );
  expect(dues.revenue_model === originalModel, "revenue_model matches platform_config", dues);

  // ---- assertion 3: configured-model lockout semantics -------------------
  expect(
    dues.is_dispatch_locked ===
      (isGated(originalModel) && expectedDue >= originalCeiling),
    isGated(originalModel)
      ? "gated model locks because due >= ceiling"
      : "subscription_only does not lock on commission debt",
    dues,
  );

  // ---- assertion 4: lockout follows config without restart ---------------
  configTouched = true;
  await db`update platform_config set value = 'hybrid', updated_at = now() where key = ${REVENUE_MODEL_KEY}`;

  const hybrid = await callDuesRoute(token);
  expect(hybrid.status === 200, "GET with revenue_model=hybrid returns 200", hybrid);
  const hybridDues = hybrid.body as DuesResponse;
  console.log("GET /api/driver/dues (hybrid) ->", JSON.stringify(hybridDues));
  expect(
    hybridDues.revenue_model === "hybrid",
    "config change takes effect on the next request (no cache)",
    hybridDues,
  );
  expect(
    hybridDues.commission_due_bdt === expectedDue,
    "due is unchanged by the model flip",
    hybridDues,
  );
  expect(hybridDues.is_dispatch_locked === true, "hybrid locks at/over the ceiling", hybridDues);

  await db`update platform_config set value = 'subscription_only', updated_at = now() where key = ${REVENUE_MODEL_KEY}`;
  const subscriptionOnly = await callDuesRoute(token);
  expect(
    subscriptionOnly.status === 200,
    "GET with revenue_model=subscription_only returns 200",
    subscriptionOnly,
  );
  expect(
    (subscriptionOnly.body as DuesResponse).is_dispatch_locked === false,
    "unlocked again once back on subscription_only",
    subscriptionOnly.body,
  );

  // ---- postpaid leg: open bill surfaces in dues totals + lockout state ----
  const postpaidBillBdt = 3_000;
  const postpaidBill = (await db`
    insert into operator_bills (operator_id, operator_role, amount_bdt, status, kind, due_at)
    values (${driver.driver_id}, 'driver', ${postpaidBillBdt}, 'open', 'subscription_purchase',
            ${new Date(Date.now() + 7 * 86400000).toISOString()})
    returning id, amount_bdt
  `) as unknown as { id: string; amount_bdt: number }[];

  const postpaidDues = await callDuesRoute(token);
  expect(postpaidDues.status === 200, "GET with open bill returns 200", postpaidDues);
  const postpaidBody = postpaidDues.body as DuesResponse & {
    total_unpaid_paisa: number;
    open_bills?: Array<{ amount_bdt: number }>;
    monetization_state?: string;
  };
  console.log("GET /api/driver/dues (postpaid bill) ->", JSON.stringify(postpaidBody));
  expect(
    (postpaidBody.total_unpaid_paisa ?? 0) >= expectedDue + postpaidBillBdt,
    "open bill added to total_unpaid_paisa",
    postpaidBody,
  );
  expect(
    postpaidBody.open_bills?.some((b) => b.amount_bdt === postpaidBillBdt) ?? false,
    "open bill listed in open_bills",
    postpaidBody,
  );

  // Remove the probe bill so it cannot affect lockout restoration / residue.
  await db`delete from operator_bills where id = ${postpaidBill[0].id}`;

  // Restore before cleanup so cleanup only ever has to fix rows, not config.
  await db`update platform_config set value = ${originalModel}, updated_at = now() where key = ${REVENUE_MODEL_KEY}`;
  configTouched = false;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  const db = sql;

  // Kept past the delete statements so the residue check below verifies the
  // rows that were actually seeded, not the cleared module-level handles.
  const rideId = seededRideId;
  const paymentEventId = seededPaymentEventId;
  const settlementId = seededSettlementId;
  const paymentEventLookup = paymentEventKey;

  try {
    if (settlementId) {
      await db`delete from driver_commission_settlements where id = ${settlementId}::uuid`;
      seededSettlementId = null;
    }
    if (paymentEventId) {
      await db`delete from payment_events where id = ${paymentEventId}::uuid`;
      seededPaymentEventId = null;
    }
    if (rideId) {
      await db`delete from rides where id = ${rideId}::uuid`;
      seededRideId = null;
    }
    if (configTouched && originalModel !== null) {
      await db`update platform_config set value = ${originalModel}, updated_at = now() where key = ${REVENUE_MODEL_KEY}`;
      configTouched = false;
    }

    const residue = (await db`
      select
        (select count(*)::int from rides where id = ${rideId ?? "00000000-0000-0000-0000-000000000000"}::uuid) as rides,
        (select count(*)::int from payment_events where idempotency_key = ${paymentEventLookup ?? ""}) as payment_events,
        (select count(*)::int from driver_commission_settlements where id = ${settlementId ?? "00000000-0000-0000-0000-000000000000"}::uuid) as settlements,
        (select value from platform_config where key = ${REVENUE_MODEL_KEY}) as revenue_model,
        (select value from platform_config where key = ${PROBE_MAX_DEBT_KEY}) as ceiling
    `) as unknown as {
      rides: number;
      payment_events: number;
      settlements: number;
      revenue_model: string;
      ceiling: string;
    }[];
    const after = residue[0];
    console.log("cleanup:", JSON.stringify(after));

    expect(after.rides === 0, "seeded ride removed");
    expect(after.payment_events === 0, "seeded payment_event removed");
    expect(after.settlements === 0, "seeded settlement removed");
    // Config was never read if the run failed during driver selection, so only
    // assert restoration when there was something to restore.
    if (originalModel !== null) {
      expect(
        after.revenue_model === originalModel,
        `revenue_model restored to ${originalModel}`,
        after,
      );
    }
    if (originalCeiling !== null) {
      expect(
        after.ceiling === String(originalCeiling),
        `max_commission_debt_bdt unchanged (${originalCeiling})`,
        after,
      );
    }
  } catch (error) {
    failed += 1;
    console.error(`FAIL: cleanup — ${(error as Error).message}`);
    console.error(
      `MANUAL CLEANUP MAY BE REQUIRED: ride=${rideId} payment_event=${paymentEventId} settlement=${settlementId} payment_event_key=${paymentEventLookup} model=${originalModel}`,
    );
  } finally {
    await db.end();
  }
}

async function run(): Promise<void> {
  if (process.env[OPT_IN_ENV] !== "1") {
    usage();
    process.exitCode = 1;
    return;
  }

  try {
    await main();
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${(error as Error).message}`);
  } finally {
    await cleanup();
  }

  const total = passed + failed;
  if (failed === 0) {
    console.log(`RESULT: PASS — ${passed}/${total} assertions, no residue`);
  } else {
    console.error(`RESULT: FAIL — ${failed} of ${total} assertions failed`);
    process.exitCode = 1;
  }
  // The route's own pool import keeps the event loop alive; this is a one-shot
  // probe, so exit once cleanup has finished.
  process.exit(process.exitCode ?? 0);
}

void run();
