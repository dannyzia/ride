/**
 * P2-24 (gap ledger): admin driver lifecycle — the seven trust actions.
 * Invariants:
 *  - approve: pending docs → approved in the SAME tx; temporary status stamps
 *    a 30-day provisional + stage2 deadline; active clears them; an admin
 *    vehicle-type adjustment syncs drivers + vehicles AND writes an
 *    audit row into vehicle_type_changes
 *  - reject / suspend: mandatory reason (≥10 chars), suspend forces offline
 *  - activate: only temporary → active, clearing provisional deadlines
 *  - downgrade: tier-ordered (422 not_a_downgrade otherwise), immediate, with
 *    vehicleTypeChanges audit + two-table sync
 *  - close-account: status → rejected, offline, and every not-yet-purged
 *    document gets a purge_at deadline
 *  - type-change-approve: pending-only (422 already resolved), approve syncs
 *    driver + vehicle from the change record
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/vehicleTypes", () => {
  const { z } = require("zod");
  return {
    VEHICLE_TYPE_VALUES: ["bike_basic", "bike_standard", "car_economy", "car_premium"],
    VEHICLE_TYPE_ZOD_ENUM: z.enum(["bike_basic", "bike_standard", "car_economy", "car_premium"]),
    VEHICLE_TIER_ORDER: { bike_basic: 1, bike_standard: 2, car_economy: 3, car_premium: 4 },
    checkDriverEligibility: jest.fn(() => ({ eligible: true })),
  };
});

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import {
  documents,
  drivers,
  vehicles,
  vehicleTypeChanges,
} from "@/src/db/schema";
import { POST as approvePOST } from "@/app/api/admin/driver/approve+api";
import { POST as rejectPOST } from "@/app/api/admin/driver/reject+api";
import { POST as suspendPOST } from "@/app/api/admin/driver/suspend+api";
import { POST as activatePOST } from "@/app/api/admin/driver/activate+api";
import { POST as downgradePOST } from "@/app/api/admin/driver/downgrade+api";
import { POST as closeAccountPOST } from "@/app/api/admin/driver/close-account+api";
import { POST as typeChangePOST } from "@/app/api/admin/driver/type-change-approve+api";

const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const VEHICLE_ID = "44444444-4444-4444-8444-444444444444";
const CHANGE_ID = "55555555-5555-4555-8555-555555555555";
const REASON = "verified documents reviewed by admin";

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function grant(permission: string, allowed: boolean): void {
  (requireAdminPermission as jest.Mock).mockImplementation((perm: string) => {
    if (perm !== permission) {
      return jest.fn(async () => {
        throw { status: 403 };
      });
    }
    return allowed
      ? jest.fn(async () => ({
          supabaseUser: { id: "admin-supabase" },
          dbUser: { id: ADMIN_ID, role: "admin" },
        }))
      : jest.fn(async () => {
          throw { status: 401 };
        });
  });
}

const DRIVER_PENDING: Row = {
  id: DRIVER_ID,
  status: "pending",
  vehicle_type: "bike_basic",
  vehicle_id: null,
};

const txUpdates: { table: unknown; set: Row }[] = [];
const txInserts: { table: unknown; values: Row }[] = [];
const directUpdates: { table: unknown; set: Row }[] = [];

function resetWrites(): void {
  txUpdates.length = 0;
  txInserts.length = 0;
  directUpdates.length = 0;
  const recordTx = (table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn(async () => {
        txUpdates.push({ table, set: setObj });
        return [];
      }),
    })),
  });
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn(async () => {
        directUpdates.push({ table, set: setObj });
        return [];
      }),
    })),
  }));
  const tx = {
    update: jest.fn(recordTx),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((v: Row) => {
        txInserts.push({ table, values: v });
        return Promise.resolve([]);
      }),
    })),
    select: jest.fn(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: jest.fn(async () => []),
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([]).then(res, rej),
      };
      return chain;
    }),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetWrites();
  grant("verification.write", true);
});

function mockDriverRow(row: Row | null): void {
  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(async () => (row ? [row] : [])),
      })),
    })),
  }));
}

describe("POST /api/admin/driver/approve", () => {
  test("401 when the verification.write guard rejects", async () => {
    grant("verification.write", false);
    const res = await approvePOST(jsonRequest({ driver_id: DRIVER_ID }));
    expect(res.status).toBe(401);
  });

  test("403 for a permission outside verification.write", async () => {
    grant("safety.write", true);
    const res = await approvePOST(jsonRequest({ driver_id: DRIVER_ID }));
    expect(res.status).toBe(403);
  });

  test("404 driver_not_found", async () => {
    mockDriverRow(null);
    const res = await approvePOST(jsonRequest({ driver_id: DRIVER_ID }));
    expect(res.status).toBe(404);
  });

  test("active approval: pending docs approved, provisional deadlines cleared", async () => {
    mockDriverRow(DRIVER_PENDING);

    const res = await approvePOST(jsonRequest({ driver_id: DRIVER_ID }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toMatchObject({ driver_id: DRIVER_ID, new_status: "active", provisional_expires_at: null });

    const docUpdate = txUpdates.find((u) => u.table === documents);
    expect(docUpdate!.set).toMatchObject({ status: "approved", reviewed_by: ADMIN_ID });
    const driverUpdate = txUpdates.find((u) => u.table === drivers);
    expect(driverUpdate!.set.status).toBe("active");
    expect(driverUpdate!.set.provisional_expires_at).toBeNull();
    expect(driverUpdate!.set.stage2_due_at).toBeNull();
  });

  test("temporary approval stamps 30-day provisional + stage2 deadlines", async () => {
    mockDriverRow(DRIVER_PENDING);

    const res = await approvePOST(jsonRequest({ driver_id: DRIVER_ID, new_status: "temporary" }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const expires = body.provisional_expires_at as string;
    expect(expires).toBeTruthy();
    // ~30 days out
    expect(Number(new Date(expires)) - Date.now()).toBeGreaterThan(29 * 86_400_000);
    const driverUpdate = txUpdates.find((u) => u.table === drivers);
    expect(driverUpdate!.set.status).toBe("temporary");
    expect(driverUpdate!.set.stage2_due_at).toEqual(new Date(expires));
  });

  test("vehicle_type_adjusted syncs drivers + vehicles and writes the audit row", async () => {
    mockDriverRow({ ...DRIVER_PENDING, vehicle_id: VEHICLE_ID });

    const res = await approvePOST(jsonRequest({
      driver_id: DRIVER_ID,
      vehicle_type_adjusted: "car_economy",
      reason: "sedan on file",
    }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.vehicle_type_adjusted).toBe(true);
    expect(body.adjusted_to).toBe("car_economy");

    const driverUpdate = txUpdates.filter((u) => u.table === drivers);
    expect(driverUpdate[0].set.vehicle_type).toBe("car_economy");
    const vehicleUpdate = txUpdates.find((u) => u.table === vehicles);
    expect(vehicleUpdate!.set.vehicle_type).toBe("car_economy");
    const audit = txInserts.find((i) => i.table === vehicleTypeChanges);
    expect(audit).toBeDefined();
    expect(audit!.values).toMatchObject({
      driver_id: DRIVER_ID,
      old_vehicle_type: "bike_basic",
      new_vehicle_type: "car_economy",
      change_reason: "admin_approval_adjustment",
      status: "approved",
      changed_by: ADMIN_ID,
    });
  });
});

describe("POST /api/admin/driver/reject", () => {
  test("400 validation_error for a too-short reason", async () => {
    mockDriverRow(DRIVER_PENDING);
    const res = await rejectPOST(jsonRequest({ driver_id: DRIVER_ID, reason: "bad" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("rejects the driver and the pending docs with the reason in one tx", async () => {
    mockDriverRow(DRIVER_PENDING);

    const res = await rejectPOST(jsonRequest({ driver_id: DRIVER_ID, reason: REASON }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ driver_id: DRIVER_ID, status: "rejected" });

    const driverUpdate = txUpdates.find((u) => u.table === drivers);
    expect(driverUpdate!.set.status).toBe("rejected");
    const docUpdate = txUpdates.find((u) => u.table === documents);
    expect(docUpdate!.set).toMatchObject({ status: "rejected", reviewed_by: ADMIN_ID, rejection_reason: REASON });
  });
});

describe("POST /api/admin/driver/suspend", () => {
  test("403 when the caller lacks safety.write", async () => {
    grant("verification.write", true);
    const res = await suspendPOST(jsonRequest({ driver_id: DRIVER_ID, reason: REASON }));
    expect(res.status).toBe(403);
  });

  test("suspends and forces the driver offline (direct update, no tx)", async () => {
    grant("safety.write", true);
    mockDriverRow({ ...DRIVER_PENDING, status: "active", is_online: true });

    const res = await suspendPOST(jsonRequest({ driver_id: DRIVER_ID, reason: REASON }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ driver_id: DRIVER_ID, status: "suspended" });
    expect(directUpdates).toHaveLength(1);
    expect(directUpdates[0].table).toBe(drivers);
    expect(directUpdates[0].set).toMatchObject({ status: "suspended", is_online: false });
  });

  test("F-9.2: notifies the dispatch server's force-offline endpoint (fire-and-forget, correct auth + payload)", async () => {
    grant("safety.write", true);
    mockDriverRow({ ...DRIVER_PENDING, status: "active", is_online: true });
    const fetchMock = jest.fn(async () => ({ ok: true }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    process.env.WEBSOCKET_INTERNAL_SECRET = "test-internal-secret";
    process.env.UTILS_SERVER_PORT = "3001";

    const res = await suspendPOST(jsonRequest({ driver_id: DRIVER_ID, reason: REASON }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3001/internal/driver/force-offline");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-internal-secret");
    expect(JSON.parse(String(init.body))).toEqual({ driver_id: DRIVER_ID, reason: `suspended: ${REASON}` });
    delete process.env.WEBSOCKET_INTERNAL_SECRET;
  });

  test("F-9.2: force-offline failure never fails the admin action (suspension still returns 200)", async () => {
    grant("safety.write", true);
    mockDriverRow({ ...DRIVER_PENDING, status: "active", is_online: true });
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new Error("connection refused");
    });
    process.env.WEBSOCKET_INTERNAL_SECRET = "test-internal-secret";

    const res = await suspendPOST(jsonRequest({ driver_id: DRIVER_ID, reason: REASON }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ driver_id: DRIVER_ID, status: "suspended" });
    delete process.env.WEBSOCKET_INTERNAL_SECRET;
  });

  test("F-9.2: skips the notification entirely when the internal secret is unset (local dev)", async () => {
    grant("safety.write", true);
    mockDriverRow({ ...DRIVER_PENDING, status: "active", is_online: true });
    const fetchMock = jest.fn(async () => ({ ok: true }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    delete process.env.WEBSOCKET_INTERNAL_SECRET;

    const res = await suspendPOST(jsonRequest({ driver_id: DRIVER_ID, reason: REASON }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/driver/activate", () => {
  test("422 invalid_status unless the driver is temporary", async () => {
    mockDriverRow({ ...DRIVER_PENDING, status: "active" });
    const res = await activatePOST(jsonRequest({ driver_id: DRIVER_ID }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("invalid_status");
  });

  test("promotes temporary → active and clears provisional deadlines", async () => {
    mockDriverRow({ ...DRIVER_PENDING, status: "temporary" });

    const res = await activatePOST(jsonRequest({ driver_id: DRIVER_ID }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ driver_id: DRIVER_ID, status: "active" });
    expect(directUpdates[0].set).toMatchObject({
      status: "active",
      provisional_expires_at: null,
      stage2_due_at: null,
    });
  });
});

describe("POST /api/admin/driver/downgrade", () => {
  test("422 not_a_downgrade for a same-or-higher tier", async () => {
    mockDriverRow({ ...DRIVER_PENDING, status: "active", vehicle_type: "bike_standard" });

    const res = await downgradePOST(jsonRequest({
      driverId: DRIVER_ID,
      new_vehicle_type: "car_premium",
      reason: REASON,
    }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("not_a_downgrade");
    expect(txInserts).toHaveLength(0);
  });

  test("downgrades immediately with audit row and two-table sync", async () => {
    mockDriverRow({ ...DRIVER_PENDING, status: "active", vehicle_type: "car_premium", vehicle_id: VEHICLE_ID });

    const res = await downgradePOST(jsonRequest({
      driverId: DRIVER_ID,
      new_vehicle_type: "bike_basic",
      reason: REASON,
    }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toEqual({ success: true, old_vehicle_type: "car_premium", new_vehicle_type: "bike_basic" });

    const audit = txInserts.find((i) => i.table === vehicleTypeChanges);
    expect(audit!.values).toMatchObject({
      change_reason: "admin_downgrade",
      old_vehicle_type: "car_premium",
      new_vehicle_type: "bike_basic",
      status: "approved",
    });
    const synced = txUpdates.filter((u) => u.table === drivers || u.table === vehicles);
    expect(synced).toHaveLength(2);
    expect(synced.every((u) => u.set.vehicle_type === "bike_basic")).toBe(true);
  });
});

describe("POST /api/admin/driver/close-account", () => {
  test("403 when the caller lacks safety.write", async () => {
    grant("verification.write", true);
    const res = await closeAccountPOST(jsonRequest({ driver_id: DRIVER_ID, reason: REASON }));
    expect(res.status).toBe(403);
  });

  test("closes the account: rejected + offline, documents get a future purge_at", async () => {
    grant("safety.write", true);
    mockDriverRow({ ...DRIVER_PENDING, status: "active", is_online: true });

    const res = await closeAccountPOST(jsonRequest({ driver_id: DRIVER_ID, reason: REASON }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.status).toBe("rejected");
    const purgeAt = new Date(body.documents_purge_at as string);
    expect(Number(purgeAt) - Date.now()).toBeGreaterThan(0);

    const driverUpdate = txUpdates.find((u) => u.table === drivers);
    expect(driverUpdate!.set).toMatchObject({ status: "rejected", is_online: false });
    const docUpdate = txUpdates.find((u) => u.table === documents);
    expect(docUpdate!.set.purge_at).toEqual(purgeAt);
  });
});

describe("POST /api/admin/driver/type-change-approve", () => {
  const CHANGE: Row = {
    id: CHANGE_ID,
    driver_id: DRIVER_ID,
    status: "pending",
    new_vehicle_type: "car_economy",
  };

  test("404 change_not_found", async () => {
    mockDriverRow(null);
    const res = await typeChangePOST(jsonRequest({ change_id: CHANGE_ID, action: "approve" }));
    expect(res.status).toBe(404);
  });

  test("422 change_already_resolved for a non-pending record", async () => {
    mockDriverRow({ ...CHANGE, status: "approved" });
    const res = await typeChangePOST(jsonRequest({ change_id: CHANGE_ID, action: "approve" }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("change_already_resolved");
  });

  test("approve: change marked approved and driver + vehicle synced to the new type", async () => {
    mockDriverRow(CHANGE);
    // the in-tx vehicles lookup consumes a select too — rebuild the queue
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call++;
      const rows = call === 1 ? [CHANGE] : [];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: jest.fn(async () => rows),
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    });

    const res = await typeChangePOST(jsonRequest({ change_id: CHANGE_ID, action: "approve" }));
    expect(res.status).toBe(200);

    const changeUpdate = txUpdates.find((u) => u.table === vehicleTypeChanges);
    expect(changeUpdate!.set).toMatchObject({ status: "approved", changed_by: ADMIN_ID });
    const driverUpdate = txUpdates.find((u) => u.table === drivers);
    expect(driverUpdate!.set.vehicle_type).toBe("car_economy");
  });
});
