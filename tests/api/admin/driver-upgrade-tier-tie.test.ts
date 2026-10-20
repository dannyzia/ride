/**
 * S8 lateral-move pin (§6.5.6): POST /api/admin/driver/upgrade rejects tier
 * ties with `not_an_upgrade` — including the scooter ≡ bike_basic tie
 * (VEHICLE_TIER_ORDER scooter:0). The driver self-service route
 * (vehicle-type-change) has no tier gate, so bike_basic ↔ scooter lateral
 * moves succeed there; the admin upgrade path is upgrades-only.
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { POST } from "@/app/api/admin/driver/upgrade+api";

const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

function jsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function mockDriverRow(vehicleType: string): void {
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = [{ id: DRIVER_ID, vehicle_type: vehicleType }];
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
    };
    return chain;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireAdminPermission as jest.Mock).mockImplementation(() =>
    jest.fn(async () => ({ supabaseUser: { id: "admin" }, dbUser: { role: "owner" } })),
  );
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      insert: () => ({ values: async () => [] }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    }),
  );
});

describe("POST /api/admin/driver/upgrade — tier-tie pin", () => {
  test("bike_basic → scooter rejects 422 not_an_upgrade (tier tie, S8)", async () => {
    mockDriverRow("bike_basic");
    const res = await POST(
      jsonRequest({ driver_id: DRIVER_ID, new_vehicle_type: "scooter", reason: "lateral move attempt" }),
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("not_an_upgrade");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("bike_basic → bike_standard succeeds (strict upgrade)", async () => {
    mockDriverRow("bike_basic");
    const res = await POST(
      jsonRequest({ driver_id: DRIVER_ID, new_vehicle_type: "bike_standard", reason: "genuine upgrade path" }),
    );
    expect(res.status).toBe(200);
  });
});
