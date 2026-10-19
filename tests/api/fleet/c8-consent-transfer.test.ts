// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (Phase 5 precedent, tests/api/rental/truck-rental.test.ts).
/**
 * C8-1 — consent-path transfer-out compares owner_user_id (not fleet_type).
 *
 * POST /api/driver/fleet-invites/[id]/respond (accept):
 * - owner X's grown NATIVE fleet + fleet B invite → 409 single_fleet_rule
 * - own solo NATIVE fleet (owner_user_id = caller) → 200 transferred
 *
 * Invokes the REAL handler; only DB/auth/limits/logger are mocked.
 */

import { POST as respond } from "@/app/api/driver/fleet-invites/[id]/respond+api";

const mockInviteId = "00000000-0000-4000-8000-000000000011";
const mockFleetB = "00000000-0000-4000-8000-000000000022";
const mockCurrentFleet = "00000000-0000-4000-8000-000000000033";
const mockCallerId = "00000000-0000-4000-8000-000000000044";
const mockOwnerX = "00000000-0000-4000-8000-000000000055";
const mockDriverId = "00000000-0000-4000-8000-000000000066";

const CALLER_PHONE = "+8801700000001";

// Controllable mock tables (routed by table identity in the factory).
let mockInviteRow: Record<string, unknown> | null = null;
let mockTargetFleetRow: Record<string, unknown> | null = null;
let mockCurrentFleetRow: Record<string, unknown> | null = null;
let mockDriverRow: Record<string, unknown> | null = null;
let mockOnlineRow: Record<string, unknown> | null = null;
let mockAssignmentRows: Record<string, unknown>[] = [];

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    users: schema.users,
    invites: schema.fleetDriverInvites,
    fleets: schema.fleets,
    drivers: schema.drivers,
    assignments: schema.fleetVehicleAssignments,
  };

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.for = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const resolveRows = (t: unknown) => {
    if (t === T.users) return [{ id: mockCallerId, phone: CALLER_PHONE }];
    if (t === T.invites) return mockInviteRow ? [mockInviteRow] : [];
    // Fleets serves BOTH the target-fleet ACTIVE gate and the current-fleet
    // ownership read — the handler takes [0] of each, so serve FIFO: first
    // read → target fleet, second → current fleet.
    if (t === T.fleets) {
      if (!resolveRows.fleetsServed) {
        resolveRows.fleetsServed = true;
        return mockTargetFleetRow ? [mockTargetFleetRow] : [];
      }
      return mockCurrentFleetRow ? [mockCurrentFleetRow] : [];
    }
    if (t === T.drivers) {
      // First drivers read = existing-driver lookup; second = online re-read.
      if (!resolveRows.driversServed) {
        resolveRows.driversServed = true;
        return mockDriverRow ? [mockDriverRow] : [];
      }
      return mockOnlineRow ? [mockOnlineRow] : [];
    }
    if (t === T.assignments) return mockAssignmentRows;
    return [];
  };
  resolveRows.driversServed = false;
  resolveRows.fleetsServed = false;

  const fromQ = (t: unknown) => {
    const q: any = {};
    q.where = () => chainable(resolveRows(t));
    return q;
  };

  const selectFn = () => ({
    from: (t: unknown) => fromQ(t),
  });

  const updateFn = () => ({
    set: () => ({
      where: () => ({
        returning: async () => [{ id: mockInviteId, fleet_id: mockFleetB }],
      }),
    }),
  });

  const insertFn = () => ({
    values: () => ({
      returning: async () => [{ id: mockDriverId }],
    }),
  });

  // NOTE: select/update/insert must stay FUNCTIONS (the handler calls
  // db.select({...}), tx.update(...), ...). Passing invoked builders makes
  // db.select an object and every call 500s with "not a function".
  const txHandle = { select: selectFn, update: updateFn, insert: insertFn };

  return {
    db: {
      select: selectFn,
      update: updateFn,
      insert: insertFn,
      transaction: async (fn: (tx: unknown) => unknown) => {
        resolveRows.driversServed = false;
        resolveRows.fleetsServed = false;
        return fn(txHandle);
      },
    },
  };
});

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: async () => ({ id: "auth-test" }),
}));

jest.mock("@/lib/fleetLimits", () => ({
  takeFleetLimitLock: async () => {},
  checkDriverLimit: async () => ({ ok: true }),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function acceptRequest() {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "accept" }),
  });
}

function pendingInvite() {
  return {
    id: mockInviteId,
    fleet_id: mockFleetB,
    phone: CALLER_PHONE,
    status: "pending",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

beforeEach(() => {
  mockInviteRow = pendingInvite();
  mockTargetFleetRow = { id: mockFleetB, status: "ACTIVE" };
  mockCurrentFleetRow = null;
  mockDriverRow = {
    id: mockDriverId,
    fleet_id: mockCurrentFleet,
    status: "active",
  };
  mockOnlineRow = { is_online: false };
  mockAssignmentRows = [];
});

describe("C8-1 — consent-path transfer-out ownership check", () => {
  it("grown NATIVE fleet owned by X + fleet B invite → 409 single_fleet_rule", async () => {
    // The regression: fleet_type NATIVE used to PASS this gate. Ownership by
    // someone else must still reject, whatever the fleet_type.
    mockCurrentFleetRow = {
      id: mockCurrentFleet,
      fleet_type: "NATIVE",
      owner_user_id: mockOwnerX,
    };
    const res = await respond(acceptRequest(), { id: mockInviteId });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "single_fleet_rule",
      message: "You already belong to another fleet — leave it before accepting",
    });
  });

  it("own solo NATIVE fleet (owner = caller) → 200 transferred", async () => {
    mockCurrentFleetRow = {
      id: mockCurrentFleet,
      fleet_type: "NATIVE",
      owner_user_id: mockCallerId,
    };
    const res = await respond(acceptRequest(), { id: mockInviteId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      driver_id: mockDriverId,
      attached: "transferred",
      status: "accepted",
    });
  });

  it("another owner's BUSINESS fleet → 409 single_fleet_rule (unchanged)", async () => {
    mockCurrentFleetRow = {
      id: mockCurrentFleet,
      fleet_type: "BUSINESS",
      owner_user_id: mockOwnerX,
    };
    const res = await respond(acceptRequest(), { id: mockInviteId });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("single_fleet_rule");
  });
});
