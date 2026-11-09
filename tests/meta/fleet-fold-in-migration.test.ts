/**
 * Batch-2 Item 10 — the fleet fold-in migration (0101) and the retirement of
 * the legacy fleet-subscription writers.
 *
 * The migration is pure SQL/DML: with a mocked db no unit test can execute it,
 * so this file pins its CONTENT the way the other migration suites in
 * tests/meta do (see shop-members-reinvite-partial.test.ts) — every fact the
 * fold depends on is asserted against the shipped file:
 *
 *   - plan id PRESERVED as packages.id (that is what makes the possession rows
 *     mappable without a join table);
 *   - applicable_roles = '{fleet}', call_count = 0, commission_percent NULL,
 *     product_type 'call_package' (legacy label, documented);
 *   - duration from billing_period (7 / 30 / 365);
 *   - name-collision tiers, each checked against LIVE packages only;
 *   - ACTIVE subscriptions → one ACTIVE possession per fleet, expiry from
 *     current_period_end, and no row for a fleet that already holds one;
 *   - NOTHING is dropped (the capacity profile lives only in the legacy table).
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const MIGRATION = "src/db/migrations/0101_fleet_fold_in.sql";
const JOURNAL = "src/db/migrations/meta/_journal.json";

describe("0101_fleet_fold_in.sql — plan → package", () => {
  const sql = read(MIGRATION);

  it("folds live plans into packages with the PLAN ID PRESERVED", () => {
    expect(sql).toMatch(/INSERT INTO packages\s*\(/);
    // The first selected column is the plan PK — not a generated uuid.
    expect(sql).toMatch(/SELECT\s*\n\s*p\.id,/);
    expect(sql).toContain("FROM fleet_subscription_plans p");
    expect(sql).toContain("WHERE p.active");
    // Re-runnable: an already-folded plan (same id) is skipped.
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM packages x WHERE x.id = p.id)");
  });

  it("carries the four operative facts: fleet applicability, no leads, price, active", () => {
    expect(sql).toContain("'{fleet}'::text[]");
    // No lead leg for a fleet package.
    expect(sql).toMatch(/NULL,\s*-- no machine code[\s\S]*?\n  0,/);
    expect(sql).toContain("p.price_bdt");
    // Legacy naming, deliberate: the label is 'call_package', the facts are
    // applicability + call_count.
    expect(sql).toContain("'call_package'");
    // Commission is unsupported for fleets in v1 — folded rows must not carry one.
    expect(sql).toContain("NULL,                     -- commission leg unsupported for fleets in v1");
  });

  it("maps billing_period → duration_days (7 / 30 / 365)", () => {
    expect(sql).toContain("WHEN 'WEEKLY'  THEN 7");
    expect(sql).toContain("WHEN 'MONTHLY' THEN 30");
    expect(sql).toContain("WHEN 'YEARLY'  THEN 365");
  });

  it("handles name collisions against LIVE packages in three tiers", () => {
    // Tier 1 is the plan name itself when it is free.
    expect(sql).toContain("WHERE x.deleted_at IS NULL AND x.name = p.name");
    // Tier 2 appends ' (fleet)' (and stays inside varchar(100)).
    expect(sql).toContain("left(p.name, 88) || ' (fleet)'");
    // Tier 3 falls back to a short-id suffix so the INSERT can never 23505 on
    // packages_name_live_uq.
    expect(sql).toContain("left(p.name, 80) || ' (fleet ' || left(p.id::text, 8) || ')'");
  });
});

describe("0101_fleet_fold_in.sql — subscription → possession", () => {
  const sql = read(MIGRATION);

  it("grants ONE active fleet possession per fleet from the ACTIVE subscription", () => {
    expect(sql).toMatch(/INSERT INTO operator_packages\s*\(/);
    expect(sql).toContain("'fleet'::operator_role");
    expect(sql).toContain("s.fleet_id"); // operator_id = the fleet
    expect(sql).toContain("s.plan_id"); // package_id = the preserved plan id
    expect(sql).toContain("'active',");
    // One row per fleet even if the legacy table holds several ACTIVE rows.
    expect(sql).toContain("SELECT DISTINCT ON (s.fleet_id)");
    expect(sql).toContain("ORDER BY s.fleet_id, s.created_at DESC");
  });

  it("expiry comes from the subscription's current_period_end", () => {
    expect(sql).toMatch(/COALESCE\(s\.started_at, s\.created_at\),\s*\n\s*s\.current_period_end/);
  });

  it("never collides with an existing active possession (interim Item 6 buys)", () => {
    expect(sql).toContain("op.operator_role = 'fleet'");
    expect(sql).toContain("op.operator_id = s.fleet_id");
    expect(sql).toContain("op.status = 'active'");
  });

  it("only maps subscriptions whose plan actually folded", () => {
    expect(sql).toContain("EXISTS (SELECT 1 FROM packages x WHERE x.id = s.plan_id)");
    expect(sql).toContain("WHERE s.status = 'ACTIVE'");
  });
});

describe("0101_fleet_fold_in.sql — retention", () => {
  const sql = read(MIGRATION);

  it("drops nothing: the legacy tables are the only home of the capacity profile", () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+fleet_/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+fleet_/i);
  });

  it("does not migrate fleet_billing_transactions (retained as history)", () => {
    expect(sql).not.toMatch(/INSERT INTO fleet_billing_transactions/i);
    // Nor does it claim a fee for any folded subscription.
    expect(sql).not.toMatch(/INSERT INTO fleet_billing/i);
  });

  it("the journal registers 0101 after 0100", () => {
    const entries = (JSON.parse(read(JOURNAL)) as { entries: { idx: number; tag: string }[] })
      .entries;
    const tags = entries.map((e) => e.tag);
    expect(tags).toContain("0101_fleet_fold_in");
    expect(tags.indexOf("0101_fleet_fold_in")).toBeGreaterThan(
      tags.indexOf("0100_operator_bills_event_scope"),
    );
  });
});

describe("legacy fleet-subscription writers are retired in code", () => {
  it("POST /api/fleet/plans is a 410 that names the replacement rail", () => {
    const src = read("app/api/fleet/plans+api.ts");
    expect(src).toContain("fleet_plans_purchase_retired");
    expect(src).toContain("status: 410");
    expect(src).toContain("/api/fleet/packages/purchase");
    // The writer itself is gone: no insert/update against the legacy tables.
    expect(src).not.toContain("insert(fleetSubscriptions)");
    expect(src).not.toContain("update(fleetSubscriptions)");
    expect(src).not.toContain("insert(fleetBillingTransactions)");
    expect(src).not.toContain("subscription_plan_id: planId");
  });

  it("admin fleet-plan CRUD is read-only (POST/PATCH 410, GET kept)", () => {
    const src = read("app/api/admin/fleet-plans+api.ts");
    expect(src).toContain("export async function GET");
    expect(src).toContain("fleet_plans_write_retired");
    expect(src.match(/status: 410/g)?.length).toBe(2);
    expect(src).not.toContain("insert(fleetSubscriptionPlans)");
    expect(src).not.toContain("update(fleetSubscriptionPlans)");
  });

  it("fleet entitlement reads are possession-based, not fleet_subscriptions", () => {
    const rbac = read("lib/marketplaceRbac.ts");
    expect(rbac).toContain("export async function fleetMarketplaceEntitlements");
    expect(rbac).toContain("eq(operatorPackages.operator_role, 'fleet')");
    expect(rbac).toContain("isOperatorPackageActive");
    expect(rbac).not.toContain("from('fleet_subscriptions')");

    const accessCheck = read("app/api/rental/access-check+api.ts");
    expect(accessCheck).toContain("fleetMarketplaceEntitlements(fleetIds)");
    expect(accessCheck).not.toContain('from("fleet_subscriptions")');

    const acceptBid = read("app/api/rental/requests/[id]/accept-bid+api.ts");
    expect(acceptBid).toContain("fleetMarketplaceEntitlements([bidRows[0].fleet_id]");
    expect(acceptBid).not.toContain("fleetSubscriptions");
  });

  it("fleet limit enforcement follows the HELD package, with the legacy pointer as fallback", () => {
    const src = read("lib/fleetLimits.ts");
    expect(src).toContain("eq(operatorPackages.operator_role, \"fleet\")");
    expect(src).toContain("isOperatorPackageActive(possession)");
    expect(src).toContain(": fleet.subscription_plan_id");
  });
});
