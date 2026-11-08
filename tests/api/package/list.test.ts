/**
 * Batch-2 Item 1 — operator applicability on the driver package listing.
 *
 * GET /api/package/list gains the applicable_roles containment filter
 * (`applicable_roles @> ARRAY['driver']::text[]`): plans whose applicable
 * operator set excludes 'driver' are not listed to drivers. The column
 * default '{driver}' keeps every existing package visible (driver path
 * unchanged today).
 *
 * The db mock is rows-in/rows-out with a per-call chain that captures the
 * WHERE argument for the packages query; the generated SQL text is asserted
 * via PgDialect so the filter construction is pinned, not just the response.
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "supa-user-1" })),
}));
jest.mock("@/lib/launchRoles", () => ({
  heldRoles: jest.fn(async () => [{ role: "driver", status: "active" }]),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { packages, drivers } from "@/src/db/schema";
import { PgDialect } from "drizzle-orm/pg-core";
import { GET } from "@/app/api/package/list+api";

type Row = Record<string, unknown>;

const USER_LOOKUP = [{ id: "11111111-1111-4111-a111-111111111111" }];
const DRIVER_LOOKUP = [{ vehicle_type: "bike_basic" }];

const DRIVER_PLAN: Row = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Starter",
  call_count: 50,
  duration_days: 30,
  price_bdt: 5000,
  daily_cap: 200,
  is_trial: false,
  vehicle_type: null,
  roles: ["driver"],
  applicable_roles: ["driver"],
};

const SHOP_PLAN: Row = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Shop Starter",
  call_count: 0,
  duration_days: 30,
  price_bdt: 10000,
  daily_cap: 200,
  is_trial: false,
  vehicle_type: null,
  roles: ["shop_owner"],
  applicable_roles: ["shop"],
};

let packageRows: Row[];
let whereArg: unknown;

function makeRequest(): Request {
  return { headers: { get: () => "valid-token" } } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  packageRows = [DRIVER_PLAN];
  whereArg = undefined;
  (db.select as jest.Mock).mockImplementation(() => {
    const state: { table?: unknown } = {};
    const chain: any = {
      from: (table: unknown) => {
        state.table = table;
        return chain;
      },
      innerJoin: () => chain,
      where: (cond: unknown) => {
        if (state.table === packages) whereArg = cond;
        return chain;
      },
      orderBy: async () => [...packageRows].sort((a, b) => Number(a.price_bdt) - Number(b.price_bdt)),
      limit: async () => (state.table === drivers ? DRIVER_LOOKUP : USER_LOOKUP),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(packageRows).then(resolve, reject),
    };
    return chain;
  });
});

describe("GET /api/package/list — operator applicability (Batch-2 Item 1)", () => {
  test("driver listing generates the applicable_roles containment for 'driver'", async () => {
    packageRows = [DRIVER_PLAN, SHOP_PLAN];

    await GET(makeRequest());

    expect(whereArg).toBeDefined();
    const sqlText = new PgDialect().sqlToQuery(whereArg as any).sql;
    expect(sqlText).toContain('"packages"."applicable_roles"');
    expect(sqlText).toContain("@> ARRAY['driver']::text[]");
  });

  test("driver-visible plans are returned with their fields", async () => {
    packageRows = [DRIVER_PLAN];

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { packages: Row[] };
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0]).toMatchObject({ id: DRIVER_PLAN.id, name: "Starter" });
  });
});
