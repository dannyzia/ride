/**
 * C10-1 — GET /api/package/active carries the stable plan `package_code`
 * (e.g. 'launch_free') so clients match the grant source on code, never on
 * the admin-editable package_name.
 *
 * DB mocked with a queue-based select (route query order: user, driver,
 * subscription, package), same pattern as purchase-gate.test.ts.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "supa-user-1" })),
}));
jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { GET } from "@/app/api/package/active+api";

type Row = Record<string, unknown>;

const USER_ROW: Row[] = [{ id: "user-1" }];
const DRIVER_ROW: Row[] = [{ id: "driver-1" }];

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: Record<string, unknown> = {
      from: jest.fn(() => chain),
      where: jest.fn(() => chain),
      limit: async () => rows,
    };
    return chain;
  });
}

const makeRequest = () => new Request("http://localhost/api/package/active");

describe("GET /api/package/active — package_code (C10-1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("carries the launch_free code so clients match grant source on code, not name", async () => {
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      [{ id: "sub-1", package_id: "pkg-1", status: "active" }],
      [{ id: "pkg-1", name: "Launch Free", code: "launch_free", vehicle_type: null }],
    ]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.package_code).toBe("launch_free");
    expect(body.subscription.package_name).toBe("Launch Free");
  });

  it("returns package_code null for ad-hoc plans without a code", async () => {
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      [{ id: "sub-2", package_id: "pkg-2", status: "active" }],
      [{ id: "pkg-2", name: "Starter", code: null, vehicle_type: null }],
    ]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.package_code).toBeNull();
  });

  it("still returns { subscription: null } when no active sub exists", async () => {
    mockSelectQueue([USER_ROW, DRIVER_ROW, []]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscription: null });
  });
});
