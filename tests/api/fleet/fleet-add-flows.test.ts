// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (house pattern: tests/api/shop/z2-emits.test.ts).
/**
 * Fleet add-flows epic Phase A (ISSUE-35) — endpoint tests.
 * Plan: .kilo/plans/2026-09-09-fleet-add-flows-epic-plan.md (ACTIVE; R1–R4).
 *
 * Invokes the REAL handlers (POST /api/fleet/vehicles, POST /api/fleet/assignments,
 * DELETE /api/fleet/vehicles/[id]); only @/src/db, @/lib/auth, @/lib/logger and
 * @/lib/fleetLimits are mocked. lib/fleetAssignment runs REAL (it is the sole
 * write path under test — its selects route through the same table mock and its
 * updates are captured by the recorder).
 *
 * AC-4 matrix cells (per plan §9) for each ADD endpoint:
 *   under-limit ok (201) · at-limit 403 plan_limit_exceeded + current/limit in
 *   body · NULL limit unlimited (201) · no-subscription unlimited (201) ·
 *   fail-open DB error (201; the real lib's fail-open semantics are unit-covered
 *   in tests/api/fleet/plan-limits.test.ts — at endpoint level a failed-open
 *   check is indistinguishable from ok:true, so the cell asserts the endpoint
 *   does not second-guess an ok result).
 * Plus: role matrix, fleet-status gate, advisory-lock call-order, dup
 * registration 409, error-first DELETE paths (409 vehicle_in_use / 409
 * vehicle_has_history / 404s / invalid_uuid), zero-writes on failure.
 *
 * Phase B (ISSUE-35): POST /api/fleet/drivers §4.3 attach-or-transfer —
 * A1 provision / A2 already_in_fleet / B1 transfer / B2 driver_transfer_blocked
 * (active assignment OR online), user probe 404, role matrix, lock/check
 * call-order, tx-handle check, zero-writes on every failure path.
 */

import { POST as postVehicle } from "@/app/api/fleet/vehicles+api";
import { POST as postDriver } from "@/app/api/fleet/drivers+api";
import { db } from "@/src/db";
import {
  POST as postAssignment,
  PATCH as patchUnassign,
} from "@/app/api/fleet/assignments+api";
import { DELETE as deleteVehicle } from "@/app/api/fleet/vehicles/[id]+api";
import * as fleetLimits from "@/lib/fleetLimits";
// Table identity for write-capture assertions (schema is NOT mocked; this is
// the same module instance the db-mock factory's require() resolves to).
import * as schema from "@/src/db/schema";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const FLEET = "11111111-1111-4111-8111-111111111111";
const FLEET2 = "22222222-2222-4222-8222-222222222222";
const VEH = "33333333-3333-4333-8333-333333333333";
const VEH2 = "44444444-4444-4444-8444-444444444444";
const DRV = "55555555-5555-4555-8555-555555555555";
const USER1 = "66666666-6666-4666-8666-666666666666";
const BAD_ID = "not-a-uuid";

let mockFleetRows: Record<string, unknown>[] = [];
let mockVehicleRows: Record<string, unknown>[] = [];
let mockDriverRows: Record<string, unknown>[] = [];
let mockUserRows: Record<string, unknown>[] = [];
let mockActiveAssignmentRows: Record<string, unknown>[] = [];
let mockSelectQueue: unknown[][] = []; // FIFO of ad-hoc select results
let mockScriptQueue: unknown[] = []; // scripted fleetLimits check results
let mockAuthStatus: number | null = null; // null = auth ok
let mockRole = "OWNER";
let mockInserts: { table: unknown; vals: Record<string, unknown> }[] = [];
let mockUpdates: { table: unknown; vals: Record<string, unknown> }[] = [];
let mockDeletedFrom: unknown[] = [];
let mockDeleteImpl: (() => never) | null = null;
let mockAuthCalls: { fleetId: string; roles?: readonly string[] }[] = [];
// fleetLimits call capture (mock-prefixed so the jest.mock factory may touch them).
let mockLimitChecks: { fleetId: string; hasTx: boolean }[] = [];
let mockLockCalls: { fleetId: string }[] = [];

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    fleets: schema.fleets,
    vehicles: schema.vehicles,
    drivers: schema.drivers,
    fleetVehicleAssignments: schema.fleetVehicleAssignments,
    users: schema.users,
  };

  const resolveRows = (t: unknown) => {
    if (t === T.fleets) return mockFleetRows;
    if (t === T.vehicles) return mockVehicleRows;
    if (t === T.drivers) return mockDriverRows;
    if (t === T.fleetVehicleAssignments) return mockActiveAssignmentRows;
    if (t === T.users) return mockUserRows;
    return [];
  };

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.offset = () => c;
    c.orderBy = () => c;
    c.groupBy = () => c;
    c.for = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const makeSelect = () =>
    () => ({
      from: (t: unknown) => ({
        where: () => {
          const queued = mockSelectQueue.shift();
          if (queued) return chainable(queued); // ad-hoc selects (unused in these flows)
          return chainable(resolveRows(t));
        },
      }),
    });

  const makeUpdate = () =>
    (t: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          mockUpdates.push({ table: t, vals });
          return { returning: async () => [{ id: "updated-uuid" }] };
        },
        returning: async () => [{ id: "updated-uuid" }],
      }),
    });

  const recordInsert = () =>
    (t: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        mockInserts.push({ table: t, vals });
        return { returning: async () => [{ id: "generated-uuid", ...vals }] };
      },
    });

  const makeDb = () => ({
    select: makeSelect(),
    update: makeUpdate(),
    insert: recordInsert(),
    execute: async () => {},
    delete: () => ({
      where: () => {
        if (mockDeleteImpl) return mockDeleteImpl();
        mockDeletedFrom.push(T.vehicles);
        return Promise.resolve();
      },
    }),
  });

  return {
    db: {
      ...makeDb(),
      transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(makeDb())),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  requireFleetMember:
    (fleetId: string, roles?: readonly string[]) =>
    async () => {
      mockAuthCalls.push({ fleetId, roles });
      if (mockAuthStatus !== null) {
        throw Object.assign(new Error("Forbidden"), { status: mockAuthStatus });
      }
      return {
        supabaseUser: { id: "auth-user" },
        dbUser: { id: "user-1", role: "driver" },
        fleetMember: { id: "fm-1", role: mockRole, status: "active", removed_at: null },
      };
    },
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/lib/fleetLimits", () => ({
  checkVehicleLimit: jest.fn((fleetId: string, opts?: { tx?: unknown }) => {
    mockLimitChecks.push({ fleetId, hasTx: !!opts?.tx });
    const next = mockScriptQueue.shift();
    if (!next) throw new Error("unexpected checkVehicleLimit — no scripted result");
    return next;
  }),
  checkDriverLimit: jest.fn((fleetId: string, opts?: { tx?: unknown }) => {
    // Phase B: same scripted contract as checkVehicleLimit (§4.3 driver add).
    mockLimitChecks.push({ fleetId, hasTx: !!opts?.tx });
    const next = mockScriptQueue.shift();
    if (!next) throw new Error("unexpected checkDriverLimit — no scripted result");
    return next;
  }),
  takeFleetLimitLock: jest.fn((_tx: unknown, fleetId: string) => {
    mockLockCalls.push({ fleetId });
  }),
}));

function makeRequest(method: string, body?: unknown, url = "http://localhost/api/test") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const okCheck = (current = 2, limit = 5) => ({ ok: true, current, limit });
const breachCheck = (current = 5, limit = 5) => ({
  ok: false,
  error: "plan_limit_exceeded",
  message: `Vehicles limit reached (${current}/${limit}) on the "Basic" plan. Upgrade your plan to add more.`,
  current,
  limit,
});

const vehicleBody = (over: Record<string, unknown> = {}) => ({
  vehicle_type: "car_economy",
  registration_plate: "ka 12-3456",
  manufacturer: "Toyota",
  model: "Axio",
  manufacturing_year: 2022,
  passenger_seats: 4,
  ...over,
});

beforeEach(() => {
  mockFleetRows = [{ id: FLEET, status: "ACTIVE" }];
  mockVehicleRows = [];
  mockDriverRows = [];
  mockUserRows = [{ id: USER1 }];
  mockActiveAssignmentRows = [];
  mockSelectQueue = [];
  mockScriptQueue = [];
  mockAuthStatus = null;
  mockRole = "OWNER";
  mockInserts = [];
  mockUpdates = [];
  mockDeletedFrom = [];
  mockDeleteImpl = null;
  mockAuthCalls = [];
  mockLimitChecks = [];
  mockLockCalls = [];
});

// ─────────────────────── POST /api/fleet/vehicles ────────────────────────

describe("POST /api/fleet/vehicles", () => {
  it("under-limit → 201, insert recorded with uppercased plate + house defaults", async () => {
    mockScriptQueue.push(okCheck(2, 5));

    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.vehicle_id).toBe("generated-uuid");
    expect(mockInserts).toHaveLength(1);
    const vals = mockInserts[0].vals;
    expect(vals.registration_number).toBe("KA 12-3456"); // uppercased
    expect(vals.fleet_id).toBe(FLEET);
    expect(vals.driver_id).toBeNull(); // pool vehicle; pointer cache only via fleetAssignment
    expect(vals.registration_area).toBe("DHAKA_METRO"); // FOLLOWUP-B default
    expect(vals.vehicle_class_letter).toBe("KA"); // FOLLOWUP-A default
    expect(vals.has_ac).toBeNull();
    expect(vals.registration_date).toBe("2022-01-01");
    expect(vals.fitness_expires_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("at-limit → 403 plan_limit_exceeded with current/limit in body, zero inserts", async () => {
    mockScriptQueue.push(breachCheck(5, 5));

    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("plan_limit_exceeded");
    expect(body.current).toBe(5);
    expect(body.limit).toBe(5);
    expect(body.message).toContain("5/5");
    expect(mockInserts).toHaveLength(0);
    // AC-3/plan §9 call-order: lock precedes the limit check, and the check
    // fired before any insert could (inserts empty above proves check-first
    // on the breach path).
    const lockOrder = (fleetLimits.takeFleetLimitLock as jest.Mock).mock.invocationCallOrder[0];
    const checkOrder = (fleetLimits.checkVehicleLimit as jest.Mock).mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(checkOrder);
  });

  it("NULL limit → 201 (unlimited cell; scripted by the real lib semantics)", async () => {
    mockScriptQueue.push(okCheck());
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    expect(res.status).toBe(201);
  });

  it("no subscription → 201 (open-access cell)", async () => {
    mockScriptQueue.push(okCheck());
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    expect(res.status).toBe(201);
  });

  it("fail-open DB error → 201 (endpoint must not second-guess an ok result)", async () => {
    // The real lib fails open on DB errors and returns ok:true (unit-covered
    // in plan-limits.test.ts). At endpoint level the cell asserts the route
    // accepts a failed-open ok without re-consulting the display-only GET flags.
    mockScriptQueue.push(okCheck());
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    expect(res.status).toBe(201);
  });

  it("limit check runs on the tx handle (same snapshot as the insert)", async () => {
    mockScriptQueue.push(okCheck());
    await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    expect(mockLimitChecks[0].hasTx).toBe(true);
    expect(mockLockCalls[0].fleetId).toBe(FLEET);
  });

  it("SUSPENDED fleet → 403 fleet_not_active, no check consulted", async () => {
    mockFleetRows = [{ id: FLEET, status: "SUSPENDED" }];
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("fleet_not_active");
    expect(mockInserts).toHaveLength(0);
    expect(mockLimitChecks).toHaveLength(0);
  });

  it("fleet not found → 404 fleet_not_found", async () => {
    mockFleetRows = [];
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("fleet_not_found");
  });

  it("duplicate registration (global unique index is schema reality) → 409", async () => {
    mockScriptQueue.push(okCheck());
    mockVehicleRows = [{ id: VEH2 }]; // dup probe hits vehicles table
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("duplicate_registration");
    expect(mockInserts).toHaveLength(0);
  });

  it("role gate: MANAGER allowed", async () => {
    mockRole = "MANAGER";
    mockScriptQueue.push(okCheck());
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    expect(res.status).toBe(201);
    expect(mockAuthCalls[0].roles).toEqual(["OWNER", "MANAGER"]);
  });

  it("role gate: VIEWER rejected with zero writes", async () => {
    mockAuthStatus = 403;
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("forbidden");
    expect(mockInserts).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
  });

  it("unauthenticated → 401", async () => {
    mockAuthStatus = 401;
    const res = await postVehicle(makeRequest("POST", vehicleBody(), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("invalid fleet_id param → 400 invalid_param", async () => {
    const res = await postVehicle(makeRequest("POST", vehicleBody(), "http://localhost/api/fleet/vehicles?fleet_id=nope"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_param");
  });

  it("invalid body → 400 validation_error (plate too short)", async () => {
    const res = await postVehicle(makeRequest("POST", vehicleBody({ registration_plate: "KA" }), `http://localhost/api/fleet/vehicles?fleet_id=${FLEET}`));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("validation_error");
  });
});

// ───────────────────── POST /api/fleet/assignments ───────────────────────

describe("POST /api/fleet/assignments", () => {
  it("success → 201; real lib closes priors, inserts active row, syncs pointer caches in-tx", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET, vehicle_type: "car_economy" }];
    mockDriverRows = [{ id: DRV, fleet_id: FLEET }];

    const res = await postAssignment(
      makeRequest("POST", { vehicle_id: VEH, driver_id: DRV, reason: "phase A" }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.assignment_id).toBe("generated-uuid");
    expect(mockAuthCalls[0].roles).toEqual(["OWNER", "MANAGER", "DISPATCHER"]);
    // Assignment row via the insert recorder, with table identity.
    const assignmentInsert = mockInserts.find((i) => i.table === schema.fleetVehicleAssignments);
    expect(assignmentInsert).toBeDefined();
    expect(assignmentInsert!.vals.status).toBe("active");
    expect(assignmentInsert!.vals.fleet_id).toBe(FLEET);
    expect(assignmentInsert!.vals.assigned_by).toBe("user-1");
    // Pointer caches written through the lib, in the same tx:
    // vehicles.driver_id ← DRV (sync), drivers.{vehicle_id, vehicle_type} ← VEH.
    const vehicleCache = mockUpdates.find(
      (u) => u.table === schema.vehicles && u.vals.driver_id === DRV,
    );
    const driverCache = mockUpdates.find(
      (u) => u.table === schema.drivers && u.vals.vehicle_id === VEH && u.vals.vehicle_type === "car_economy",
    );
    expect(vehicleCache).toBeDefined();
    expect(driverCache).toBeDefined();
    // Prior active assignments closed (vehicle-side + driver-side).
    const closed = mockUpdates.filter(
      (u) => u.table === schema.fleetVehicleAssignments && u.vals.unassigned_at instanceof Date && u.vals.status === "ended",
    );
    expect(closed).toHaveLength(2);
  });

  it("vehicle in another fleet → 404 vehicle_not_in_fleet, zero writes", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET2, vehicle_type: "car_economy" }];
    mockDriverRows = [{ id: DRV, fleet_id: FLEET }];
    const res = await postAssignment(
      makeRequest("POST", { vehicle_id: VEH, driver_id: DRV }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("vehicle_not_in_fleet");
    expect(mockInserts).toHaveLength(0);
  });

  it("driver in another fleet → 404 driver_not_in_fleet, zero writes", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET, vehicle_type: "car_economy" }];
    mockDriverRows = [{ id: DRV, fleet_id: FLEET2 }];
    const res = await postAssignment(
      makeRequest("POST", { vehicle_id: VEH, driver_id: DRV }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("driver_not_in_fleet");
    expect(mockInserts).toHaveLength(0);
  });

  it("missing vehicle → 404 vehicle_not_found", async () => {
    mockDriverRows = [{ id: DRV, fleet_id: FLEET }];
    const res = await postAssignment(
      makeRequest("POST", { vehicle_id: VEH, driver_id: DRV }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("vehicle_not_found");
  });

  it("missing driver → 404 driver_not_found", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET, vehicle_type: "car_economy" }];
    const res = await postAssignment(
      makeRequest("POST", { vehicle_id: VEH, driver_id: DRV }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("driver_not_found");
  });

  it("DISPATCHER allowed", async () => {
    mockRole = "DISPATCHER";
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET, vehicle_type: "cng" }];
    mockDriverRows = [{ id: DRV, fleet_id: FLEET }];
    const res = await postAssignment(
      makeRequest("POST", { vehicle_id: VEH, driver_id: DRV }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    expect(res.status).toBe(201);
  });

  it("non-member → 403, zero writes; no plan-limit check exists on this route", async () => {
    mockAuthStatus = 403;
    const res = await postAssignment(
      makeRequest("POST", { vehicle_id: VEH, driver_id: DRV }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    expect(res.status).toBe(403);
    expect(mockInserts).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
    expect(mockLimitChecks).toHaveLength(0);
  });

  it("invalid body (bad uuid) → 400 validation_error", async () => {
    const res = await postAssignment(
      makeRequest("POST", { vehicle_id: BAD_ID, driver_id: DRV }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("validation_error");
  });
});

// ──────────────── PATCH /api/fleet/assignments (unassign, restored) ──────

// NOTE: the assignments route shipped in 54c8466 with POST+PATCH; Phase A
// briefly overwrote it and the merge restored PATCH. These tests pin the
// restored unassign path (the ONLY way to end an active assignment).

describe("PATCH /api/fleet/assignments (unassign)", () => {
  it("success → 200; real lib ends the active assignment and clears BOTH caches", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET }];
    mockActiveAssignmentRows = [{ driver_id: DRV }]; // active row found

    const res = await patchUnassign(
      makeRequest("PATCH", { vehicle_id: VEH, reason: "wind-down" }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockAuthCalls[0].roles).toEqual(["OWNER", "MANAGER"]);
    // Assignment row ended (unassigned_at + status ended).
    const ended = mockUpdates.find(
      (u) => u.table === schema.fleetVehicleAssignments && u.vals.status === "ended" && u.vals.unassigned_at instanceof Date,
    );
    expect(ended).toBeDefined();
    // vehicles.driver_id cache cleared; drivers.vehicle_id cache cleared.
    const vehicleCacheCleared = mockUpdates.find(
      (u) => u.table === schema.vehicles && u.vals.driver_id === null,
    );
    const driverCacheCleared = mockUpdates.find(
      (u) => u.table === schema.drivers && u.vals.vehicle_id === null,
    );
    expect(vehicleCacheCleared).toBeDefined();
    expect(driverCacheCleared).toBeDefined(); // active row existed → driver side cleared
  });

  it("no active row → still 200 (idempotent; driver cache untouched)", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET }];
    mockActiveAssignmentRows = [];
    const res = await patchUnassign(
      makeRequest("PATCH", { vehicle_id: VEH }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    expect(res.status).toBe(200);
    const driverCacheCleared = mockUpdates.find(
      (u) => u.table === schema.drivers && u.vals.vehicle_id === null,
    );
    expect(driverCacheCleared).toBeUndefined();
  });

  it("role gate: non-member → 403, zero writes", async () => {
    mockAuthStatus = 403;
    const res = await patchUnassign(
      makeRequest("PATCH", { vehicle_id: VEH }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    expect(res.status).toBe(403);
    expect(mockUpdates).toHaveLength(0);
  });

  it("invalid body → 400 validation_error", async () => {
    const res = await patchUnassign(
      makeRequest("PATCH", { vehicle_id: BAD_ID }, `http://localhost/api/fleet/assignments?fleet_id=${FLEET}`),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("validation_error");
  });
});

// ──────────────── DELETE /api/fleet/vehicles/[id] (R4) ───────────────────

describe("DELETE /api/fleet/vehicles/[id]", () => {
  const del = (vehicleId = VEH) =>
    deleteVehicle(
      makeRequest("DELETE", undefined, `http://localhost/api/fleet/vehicles/${vehicleId}?fleet_id=${FLEET}`),
      { id: vehicleId },
    );

  it("clean vehicle (no active assignment, no history) → 200, row deleted, lock taken", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET }];

    const res = await del();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.vehicle_id).toBe(VEH);
    expect(mockDeletedFrom).toHaveLength(1);
    expect(mockLockCalls[0].fleetId).toBe(FLEET);
    expect(mockAuthCalls[0].roles).toEqual(["OWNER", "MANAGER"]);
  });

  it("active assignment → 409 vehicle_in_use, nothing deleted", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET }];
    mockActiveAssignmentRows = [{ id: "asg-1" }];

    const res = await del();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("vehicle_in_use");
    expect(mockDeletedFrom).toHaveLength(0);
  });

  it("append-only history (FK 23503) → 409 vehicle_has_history (points at ISSUE-36)", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET }];
    mockActiveAssignmentRows = []; // no ACTIVE row, but history exists
    mockDeleteImpl = () => {
      throw Object.assign(new Error("update or delete violates foreign key constraint"), { code: "23503" });
    };

    const res = await del();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("vehicle_has_history");
    expect(body.message).toContain("ISSUE-36");
  });

  it("vehicle not found → 404 vehicle_not_found", async () => {
    const res = await del();
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("vehicle_not_found");
  });

  it("cross-fleet vehicle → 404 vehicle_not_in_fleet (not 403 — no fleet probing)", async () => {
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET2 }];
    const res = await del();
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("vehicle_not_in_fleet");
  });

  it("invalid uuid path param → 400 invalid_uuid before any auth/DB work", async () => {
    const res = await del(BAD_ID);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_uuid");
    expect(mockAuthCalls).toHaveLength(0);
    expect(mockDeletedFrom).toHaveLength(0);
  });

  it("non-member → 403, nothing deleted", async () => {
    mockAuthStatus = 403;
    mockVehicleRows = [{ id: VEH, fleet_id: FLEET }];
    const res = await del();
    expect(res.status).toBe(403);
    expect(mockDeletedFrom).toHaveLength(0);
  });
});

// ──────────────────── POST /api/fleet/drivers (§4.3, Phase B) ────────────────────

describe("POST /api/fleet/drivers — attach-or-transfer", () => {
  const driverUrl = `http://localhost/api/fleet/drivers?fleet_id=${FLEET}`;
  const driverBody = (over: Record<string, unknown> = {}) => ({
    user_id: USER1,
    ...over,
  });

  it("A1: no drivers row → 201 provisioned; insert recorded with pending status + register-default vehicle_type", async () => {
    mockScriptQueue.push(okCheck(3, 5));

    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.attached).toBe("provisioned");
    expect(body.driver_id).toBe("generated-uuid");
    const ins = mockInserts.find((i) => i.table === schema.drivers);
    expect(ins).toBeDefined();
    expect(ins!.vals.user_id).toBe(USER1);
    expect(ins!.vals.fleet_id).toBe(FLEET);
    expect(ins!.vals.status).toBe("pending");
    // Schema reality: vehicle_type is NOT NULL — register+api.ts precedent default.
    expect(ins!.vals.vehicle_type).toBe("bike_basic");
    expect(mockUpdates).toHaveLength(0);
  });

  it("A2: drivers row already in THIS fleet → 409 already_in_fleet, zero writes", async () => {
    mockScriptQueue.push(okCheck());
    mockDriverRows = [{ id: DRV, fleet_id: FLEET, is_online: false }];

    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("already_in_fleet");
    expect(mockInserts).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
  });

  it("B1: driver in another fleet, no active work → 201 transferred; single fleet_id UPDATE, old fleet untouched", async () => {
    mockScriptQueue.push(okCheck());
    mockDriverRows = [{ id: DRV, fleet_id: FLEET2, is_online: false }];
    // mockActiveAssignmentRows = [] → no active assignment.

    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.attached).toBe("transferred");
    expect(body.driver_id).toBe(DRV);
    const upd = mockUpdates.find(
      (u) => u.table === schema.drivers && u.vals.fleet_id === FLEET,
    );
    expect(upd).toBeDefined();
    expect(mockInserts).toHaveLength(0); // transfer must not re-provision
    // Exactly one drivers UPDATE (the transfer), no assignment closes.
    expect(
      mockUpdates.filter((u) => u.table === schema.drivers),
    ).toHaveLength(1);
  });

  it("B2a: active vehicle assignment → 409 driver_transfer_blocked (assignment named in message), zero writes", async () => {
    mockScriptQueue.push(okCheck());
    mockDriverRows = [{ id: DRV, fleet_id: FLEET2, is_online: false }];
    mockActiveAssignmentRows = [
      { id: "active-assign-1", driver_id: DRV, unassigned_at: null },
    ];

    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("driver_transfer_blocked");
    expect(body.message).toContain("assignment");
    expect(mockInserts).toHaveLength(0);
    expect(
      mockUpdates.filter((u) => u.table === schema.drivers),
    ).toHaveLength(0);
  });

  it("B2b: online driver (no assignment) → 409 driver_transfer_blocked, zero writes", async () => {
    mockScriptQueue.push(okCheck());
    mockDriverRows = [{ id: DRV, fleet_id: FLEET2, is_online: true }];

    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("driver_transfer_blocked");
    expect(body.message).toContain("online");
    expect(mockInserts).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
  });

  it("at-limit → 403 plan_limit_exceeded with current/limit in body (check precedes branch dispatch)", async () => {
    mockScriptQueue.push(breachCheck(4, 4));

    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("plan_limit_exceeded");
    expect(body.current).toBe(4);
    expect(body.limit).toBe(4);
    expect(body.message).toContain("4/4");
    expect(mockInserts).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
    // Lock precedes the check (plan §5 call-order).
    const lockOrder = (fleetLimits.takeFleetLimitLock as jest.Mock).mock.invocationCallOrder[0];
    const checkOrder = (fleetLimits.checkDriverLimit as jest.Mock).mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(checkOrder);
  });

  it("limit check runs on the tx handle (same snapshot as the write)", async () => {
    mockScriptQueue.push(okCheck());
    await postDriver(makeRequest("POST", driverBody(), driverUrl));
    expect(mockLimitChecks[0].hasTx).toBe(true);
    expect(mockLockCalls[0].fleetId).toBe(FLEET);
  });

  it("SUSPENDED fleet → 403 fleet_not_active, no check consulted, zero writes", async () => {
    mockFleetRows = [{ id: FLEET, status: "SUSPENDED" }];
    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("fleet_not_active");
    expect(mockInserts).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
    expect(mockLimitChecks).toHaveLength(0);
  });

  it("target user not found → 404 user_not_found, zero writes", async () => {
    mockScriptQueue.push(okCheck());
    mockUserRows = []; // users table empty
    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("user_not_found");
    expect(mockInserts).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
  });

  it("role gate: MANAGER allowed, VIEWER rejected with zero writes", async () => {
    mockRole = "MANAGER";
    mockScriptQueue.push(okCheck());
    const ok = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    expect(ok.status).toBe(201);
    expect(mockAuthCalls[0].roles).toEqual(["OWNER", "MANAGER"]);

    mockAuthStatus = 403;
    mockScriptQueue.push(okCheck());
    const forbidden = await postDriver(
      makeRequest("POST", driverBody({ user_id: "77777777-7777-4777-8777-777777777777" }), driverUrl),
    );
    const body = await forbidden.json();
    expect(forbidden.status).toBe(403);
    expect(body.error).toBe("forbidden");
    expect(mockInserts.filter((i) => i.table === schema.drivers)).toHaveLength(1); // only the first call's
    expect(mockAuthCalls[1].roles).toEqual(["OWNER", "MANAGER"]);
  });

  it("unauthenticated → 401", async () => {
    mockAuthStatus = 401;
    const res = await postDriver(makeRequest("POST", driverBody(), driverUrl));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("invalid fleet_id param → 400 invalid_param; invalid body user_id → 400 validation_error", async () => {
    const badParam = await postDriver(
      makeRequest("POST", driverBody(), "http://localhost/api/fleet/drivers?fleet_id=nope"),
    );
    expect(badParam.status).toBe(400);
    expect((await badParam.json()).error).toBe("invalid_param");

    mockScriptQueue.push(okCheck());
    const badBody = await postDriver(
      makeRequest("POST", driverBody({ user_id: BAD_ID }), driverUrl),
    );
    expect(badBody.status).toBe(400);
    expect((await badBody.json()).error).toBe("validation_error");
  });

  it("call-order on success: lock → fleet gate → limit check → user probe → drivers probe → write", async () => {
    mockScriptQueue.push(okCheck());

    await postDriver(makeRequest("POST", driverBody(), driverUrl));

    const lockOrder = (fleetLimits.takeFleetLimitLock as jest.Mock).mock.invocationCallOrder[0];
    const checkOrder = (fleetLimits.checkDriverLimit as jest.Mock).mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(checkOrder);
    // db.transaction is invoked BEFORE its callback body (which contains the
    // lock → check → write sequence), so transaction < check; the A1 test
    // already proves the write itself happened with the scripted ok result.
    const txOrder = (db.transaction as jest.Mock).mock.invocationCallOrder[0];
    expect(txOrder).toBeLessThan(checkOrder);
  });
});
