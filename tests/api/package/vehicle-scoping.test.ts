/**
 * P0-8 (gap ledger): package vehicle-type scoping — the AGENTS.md Packages
 * rule, previously unasserted:
 *  - GET /api/package/list: a driver only sees universal (vehicle_type NULL)
 *    packages plus ones scoped to their own vehicle type; soft-deleted
 *    packages are always excluded. The visibility logic is SQL, so the where
 *    predicate is SQL-ified via PgDialect (same technique as
 *    dispatch-pool-predicates.test.ts) instead of asserting mock rows.
 *  - POST /api/package/purchase: 403 vehicle_type_mismatch when buying a
 *    package scoped to another vehicle type, plus the purchase branch matrix.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(),
    transaction: jest.fn(),
    // idempotency claim/outcome writes (lib/idempotency.ts) — fire-and-forget
    insert: jest.fn(() => ({ values: jest.fn(async () => undefined) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/portpos", () => ({
  isConfigured: jest.fn(),
}));
jest.mock("@/lib/paymentEvents", () => ({
  initiatePortposPayment: jest.fn(),
  createZeroAmountPaymentEvent: jest.fn(),
}));
jest.mock("@/lib/activateSubscription", () => ({
  activateSubscription: jest.fn(),
}));
jest.mock("@/lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(async () => ({})),
  parseConfigNumber: jest.fn((_v: string, fallback: number) => fallback),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { isConfigured } from "@/lib/portpos";
import {
  initiatePortposPayment,
  createZeroAmountPaymentEvent,
} from "@/lib/paymentEvents";
import { activateSubscription } from "@/lib/activateSubscription";
import { packages } from "@/src/db/schema";
import { GET } from "@/app/api/package/list+api";
import { POST } from "@/app/api/package/purchase+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const PKG_ID = "44444444-4444-4444-8444-444444444444";
const IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

function request(body?: unknown, headers: Record<string, string> = {}): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
    headers: { get: (k: string) => headers[k] ?? null },
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

let capturedListPredicate: SQL | undefined;

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  let currentTable: unknown;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: any = {
      from: (table: unknown) => {
        currentTable = table;
        return chain;
      },
      innerJoin: () => chain,
      where: (predicate: SQL) => {
        if (currentTable === packages) capturedListPredicate = predicate;
        return chain;
      },
      orderBy: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

function capturedListSql(): { sql: string; params: unknown[] } {
  expect(capturedListPredicate).toBeDefined();
  const rendered = new PgDialect().sqlToQuery(capturedListPredicate as SQL);
  return { sql: rendered.sql, params: rendered.params as unknown[] };
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedListPredicate = undefined;
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (isConfigured as jest.Mock).mockReturnValue(true);
  (initiatePortposPayment as jest.Mock).mockResolvedValue({
    payment_url: "https://portpos/checkout",
    payment_event_id: "pe-1",
  });
});

describe("GET /api/package/list — vehicle-type scoping (SQL-level)", () => {
  test("driver with a vehicle type sees universal OR own-type packages, never soft-deleted", async () => {
    mockSelectQueue([[{ vehicle_type: "bike_basic" }], []]);
    const res = await GET(request());
    expect(res.status).toBe(200);

    const { sql, params } = capturedListSql();
    expect(sql).toContain('"packages"."deleted_at" is null');
    expect(sql).toContain('"packages"."is_active"');
    // scoping: (vehicle_type is null OR vehicle_type = driver's type)
    expect(sql).toContain('"packages"."vehicle_type" is null');
    expect(sql).toContain(" or ");
    expect(params).toContain("bike_basic");
  });

  test("caller with no driver record sees universal packages ONLY", async () => {
    mockSelectQueue([[], []]);
    const res = await GET(request());
    expect(res.status).toBe(200);

    const { sql, params } = capturedListSql();
    expect(sql).toContain('"packages"."vehicle_type" is null');
    expect(sql).not.toContain('"packages"."vehicle_type" = ');
    expect(params).not.toContain("bike_basic");
  });
});

describe("POST /api/package/purchase — branch matrix", () => {
  const BODY = { package_id: PKG_ID, provider: "portpos" };
  const HEADERS = { "Idempotency-Key": IDEMPOTENCY_KEY };

  function queuePurchase(opts: {
    driverStatus?: string;
    driverVehicleType?: string;
    fraudFlag?: Row[];
    rideCounts?: Row;
    pkg?: Row | null;
    activeSub?: Row[];
    trialSub?: Row[];
  }): void {
    mockSelectQueue([
      [{ id: USER_ID }],
      [
        {
          id: DRIVER_ID,
          status: opts.driverStatus ?? "active",
          vehicle_type: opts.driverVehicleType ?? "bike_basic",
        },
      ],
      opts.fraudFlag ?? [],
      [opts.rideCounts ?? { completed: 0, driver_cancelled: 0, proximity_cancels: 0 }],
      opts.pkg === undefined
        ? [{ id: PKG_ID, is_active: true, is_trial: false, price_bdt: 50_000, vehicle_type: null, name: "Starter 50" }]
        : opts.pkg === null
          ? []
          : [opts.pkg],
      opts.activeSub ?? [],
      opts.trialSub ?? [],
    ]);
  }

  test("503 payment_not_configured when PortPos is unconfigured", async () => {
    (isConfigured as jest.Mock).mockReturnValue(false);
    const res = await POST(request(BODY, HEADERS));
    expect(res.status).toBe(503);
    expect((await getJson(res)).error).toBe("payment_not_configured");
  });

  test("403 driver_status_invalid for a suspended driver", async () => {
    queuePurchase({ driverStatus: "suspended" });
    const res = await POST(request(BODY, HEADERS));
    expect(res.status).toBe(403);
    expect((await getJson(res)).error).toBe("driver_status_invalid");
  });

  test("400 missing_idempotency_key when the header is absent or non-uuid", async () => {
    queuePurchase({});
    const res = await POST(request(BODY));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("missing_idempotency_key");

    queuePurchase({});
    const bad = await POST(request(BODY, { "Idempotency-Key": "not-a-uuid" }));
    expect(bad.status).toBe(400);
  });

  test("422 package_not_found for an unknown or inactive package", async () => {
    queuePurchase({ pkg: null });
    const res = await POST(request(BODY, HEADERS));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("package_not_found");
  });

  test("403 vehicle_type_mismatch when the package is scoped to another vehicle type", async () => {
    queuePurchase({ pkg: { id: PKG_ID, is_active: true, is_trial: false, price_bdt: 50_000, vehicle_type: "car_economy", name: "Car pack" } });
    const res = await POST(request(BODY, HEADERS));
    expect(res.status).toBe(403);
    expect((await getJson(res)).error).toBe("vehicle_type_mismatch");
  });

  test("409 active_subscription_exists blocks a second purchase", async () => {
    queuePurchase({ activeSub: [{ id: "sub-1" }] });
    const res = await POST(request(BODY, HEADERS));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("active_subscription_exists");
  });

  test("success: payment initiated through the write owner with the package price", async () => {
    queuePurchase({});
    const res = await POST(request(BODY, HEADERS));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ payment_url: "https://portpos/checkout", payment_event_id: "pe-1" });
    expect(initiatePortposPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        driver_id: DRIVER_ID,
        package_id: PKG_ID,
        idempotency_key: IDEMPOTENCY_KEY,
        amount_bdt: 50_000,
        purpose: "driver_package",
      }),
      expect.objectContaining({ onConflictDoNothing: true }),
    );
  });

  test("trial ৳0 package: zero-amount payment event + direct activation, no gateway", async () => {
    queuePurchase({
      pkg: { id: PKG_ID, is_active: true, is_trial: true, price_bdt: 0, vehicle_type: null, name: "Trial" },
    });
    (createZeroAmountPaymentEvent as jest.Mock).mockResolvedValue({ id: "pe-trial" });

    const res = await POST(request(BODY, HEADERS));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ payment_url: null, payment_event_id: "pe-trial", activated: true });
    expect(createZeroAmountPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ driver_id: DRIVER_ID, package_id: PKG_ID, purpose: "driver_package" }),
    );
    expect(activateSubscription).toHaveBeenCalledWith("pe-trial");
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("trial already used → 409 trial_already_used", async () => {
    queuePurchase({
      pkg: { id: PKG_ID, is_active: true, is_trial: true, price_bdt: 0, vehicle_type: null, name: "Trial" },
      trialSub: [{ id: "sub-trial" }],
    });
    const res = await POST(request(BODY, HEADERS));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("trial_already_used");
  });
});
