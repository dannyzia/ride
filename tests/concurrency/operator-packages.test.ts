/**
 * Batch-2 Item 3 — operator possession (operator_packages) via the grant lib.
 *
 * Covers: one-active barrier (second grant → OperatorPackageActiveError),
 * auto-end + re-grant cycle (endOperatorPackage frees the slot), per-role
 * independence (driver-role and shop-role slots coexist for the same
 * operator_id), and the D3-A expiry math through grantOperatorPackage.
 *
 * Gated: RUN_CONCURRENCY_TESTS=1 + SCRATCH_DATABASE_URL (never the shared dev
 * project — tests/concurrency/scratch-db-url.ts). Default suite: describe.skip,
 * zero connections (tests/meta/concurrency-gate.test.ts). Requires migration
 * 0096 applied on the scratch DB (drizzle-kit push).
 */
import "../../scripts/_load-env";
import postgresTag from "postgres";
import { randomUUID } from "crypto";
import { requireScratchDbUrl } from "./scratch-db-url";
import { db, recyclePool } from "@/src/db";
import { eq } from "drizzle-orm";
import {
  operatorPackages,
  packages,
} from "@/src/db/schema";
import {
  endOperatorPackage,
  grantOperatorPackage,
  OperatorPackageActiveError,
} from "@/lib/monetizationMode";

const RUN = process.env.RUN_CONCURRENCY_TESTS === "1";
const COND = RUN ? describe : describe.skip;
const DB_URL = process.env.SCRATCH_DATABASE_URL || process.env.DATABASE_URL;
const ORIG_DB_URL = process.env.DATABASE_URL;
const CASE_TIMEOUT_MS = 60000;

let scratch: ReturnType<typeof postgresTag>;

beforeAll(async () => {
  requireScratchDbUrl();
  scratch = postgresTag(DB_URL!, { max: 4, connect_timeout: 15 });
  const [ok] = await scratch.unsafe<{ operator_packages: unknown }[]>(
    "SELECT to_regclass('public.operator_packages') AS operator_packages",
  );
  if (!ok.operator_packages) {
    throw new Error(
      "operator_packages is missing on SCRATCH_DATABASE_URL — run drizzle-kit push against it first",
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
  try {
    await db.delete(operatorPackages);
    await db.delete(packages);
  } catch {
    // best-effort teardown
  }
});

async function seedPackage(durationDays: number | null): Promise<{ pkg: typeof packages.$inferSelect }> {
  const suf = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const [pkg] = await db
    .insert(packages)
    .values({
      name: `op-pkg-${suf}`,
      code: `op-${suf}`,
      call_count: 0,
      duration_days: durationDays,
      price_bdt: 10000,
      is_trial: false,
      is_active: true,
      daily_cap: 0,
      vehicle_type: null,
      roles: ["shop_owner"],
      product_type: "call_package",
    })
    .returning();
  return { pkg };
}

const grant = (
  operatorRole: "driver" | "shop" | "delivery" | "fleet",
  operatorId: string,
  pkg: typeof packages.$inferSelect,
) =>
  db.transaction(async (tx) =>
    grantOperatorPackage(tx, { operatorRole, operatorId, package: pkg }),
  );

COND("Batch-2 Item 3 — D3-A expiry math through grantOperatorPackage", () => {
  test("NULL duration → expires_at NULL (unlimited)", async () => {
    const { pkg } = await seedPackage(null);
    const operatorId = randomUUID();

    const row = await grant("shop", operatorId, pkg);

    expect(row.expires_at).toBeNull();
    expect(row.status).toBe("active");
    expect(row.operator_role).toBe("shop");
    expect(row.operator_id).toBe(operatorId);
  }, CASE_TIMEOUT_MS);

  test("duration_days = -1 (unlimited sentinel) → expires_at NULL", async () => {
    const { pkg } = await seedPackage(-1);
    const operatorId = randomUUID();

    const row = await grant("delivery", operatorId, pkg);

    expect(row.expires_at).toBeNull();
  }, CASE_TIMEOUT_MS);

  test("duration_days = 30 → expires_at ≈ now + 30 days", async () => {
    const { pkg } = await seedPackage(30);
    const operatorId = randomUUID();

    const row = await grant("fleet", operatorId, pkg);

    expect(row.expires_at).toBeInstanceOf(Date);
    const days =
      (new Date(row.expires_at as unknown as Date).getTime() - Date.now()) /
      86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThanOrEqual(30.01);
  }, CASE_TIMEOUT_MS);
});

COND("Batch-2 Item 3 — one-active barrier + auto-end + re-grant", () => {
  test("second active grant for the same (role, operator) raises the typed error", async () => {
    const { pkg } = await seedPackage(null);
    const operatorId = randomUUID();

    await grant("shop", operatorId, pkg);
    await expect(grant("shop", operatorId, pkg)).rejects.toEqual(
      expect.any(OperatorPackageActiveError),
    );

    // exactly one ACTIVE row remains
    const active = await db
      .select()
      .from(operatorPackages)
      .where(eq(operatorPackages.operator_id, operatorId));
    expect(active.filter((r) => r.status === "active")).toHaveLength(1);
  }, CASE_TIMEOUT_MS);

  test("auto-end: endOperatorPackage ends the active row; re-grant succeeds", async () => {
    const { pkg } = await seedPackage(null);
    const operatorId = randomUUID();

    await grant("fleet", operatorId, pkg);
    const ended = await db.transaction(async (tx) =>
      endOperatorPackage(tx, { operatorRole: "fleet", operatorId }),
    );
    expect(ended).not.toBeNull();
    expect(ended!.status).toBe("ended");
    expect(ended!.ended_at).not.toBeNull();

    // the freed slot accepts a fresh grant
    const row = await grant("fleet", operatorId, pkg);
    expect(row.status).toBe("active");
  }, CASE_TIMEOUT_MS);

  test("per-role independence: driver-role and shop-role slots coexist for one operator_id", async () => {
    const { pkg } = await seedPackage(null);
    const operatorId = randomUUID();

    const driverRow = await grant("driver", operatorId, pkg);
    const shopRow = await grant("shop", operatorId, pkg);

    expect(driverRow.status).toBe("active");
    expect(shopRow.status).toBe("active");
    expect(driverRow.operator_role).toBe("driver");
    expect(shopRow.operator_role).toBe("shop");
  }, CASE_TIMEOUT_MS);
});
