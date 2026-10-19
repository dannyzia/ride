// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (Phase 5 precedent, tests/api/rental/truck-rental.test.ts).
/**
 * C8-3 — bid submit is OWNER|MANAGER|DISPATCHER only (fleet-ack precedent).
 * C8-2 — a pure business-fleet owner (no drivers row) bids + acks end to end.
 *
 * POST /api/rental/bids:
 * - VIEWER membership → 403 forbidden (no writes run)
 * - DISPATCHER membership → 201 bid submitted
 * - pure OWNER (no drivers row anywhere) → 201 bid submitted
 * POST /api/rental/requests/[id]/fleet-ack (same owner) → 200 acknowledged
 *
 * Invokes the REAL handlers; only DB/auth/config/logger/WS are mocked.
 */

import { POST as submitBid } from "@/app/api/rental/bids+api";
import { POST as fleetAck } from "@/app/api/rental/requests/[id]/fleet-ack+api";

const mockReqId = "00000000-0000-4000-8000-0000000000a1";
const mockFleetId = "00000000-0000-4000-8000-0000000000b2";
const mockUserId = "00000000-0000-4000-8000-0000000000c3";

// Mutable per-test auth posture.
let mockBidRole = "OWNER";
let mockFleetMemberOk = true;

let mockReqRow: Record<string, unknown> | null = null;
let mockAssignmentRows: Record<string, unknown>[] = [];
let mockInsertCalls: Record<string, unknown>[] = [];
let mockUpdateCalls: Record<string, unknown>[] = [];

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    req: schema.rentalRequests,
    bids: schema.rentalBids,
    drivers: schema.drivers,
    vehicles: schema.vehicles,
    events: schema.rentalRequestEvents,
    assignments: schema.awardedBidAssignments,
  };

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.offset = () => c;
    c.orderBy = () => c;
    c.for = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const resolveRows = (t: unknown, sargs: unknown[]) => {
    const isCount = !!(sargs[0] && typeof sargs[0] === "object" && "cnt" in (sargs[0] as object));
    if (isCount) return [{ cnt: 0 }];
    if (t === T.req) return mockReqRow ? [mockReqRow] : [];
    if (t === T.assignments) return mockAssignmentRows;
    // Bids/drivers/vehicles/events: empty reads (no dupes, no tracking
    // driver, no vehicle); inserts return generated ids below.
    return [];
  };

  const fromQ = (t: unknown, sargs: unknown[]) => {
    const q: any = {};
    q.where = () => chainable(resolveRows(t, sargs));
    return q;
  };

  const selectFn = (...sargs: unknown[]) => ({
    from: (t: unknown) => fromQ(t, sargs),
  });

  const updateFn = () => ({
    set: (vals: Record<string, unknown>) => ({
      where: () => {
        mockUpdateCalls.push(vals);
        return { returning: async () => [{ id: "generated-uuid" }] };
      },
    }),
  });

  const insertFn = () => ({
    values: (vals: Record<string, unknown>) => {
      mockInsertCalls.push(vals);
      return { returning: async () => [{ id: "generated-bid-uuid" }] };
    },
  });

  const txHandle = { select: selectFn, update: updateFn, insert: insertFn };

  return {
    db: {
      select: selectFn,
      update: updateFn,
      insert: insertFn,
      transaction: async (fn: (tx: unknown) => unknown) => fn(txHandle),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  requireFleetMember: (_fleetId: string, _roles?: readonly string[]) => async () => {
    if (!mockFleetMemberOk) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return {
      supabaseUser: { id: "auth-test" },
      dbUser: { id: mockUserId },
      membership: { id: "fm-1", fleet_id: _fleetId, role: "OWNER" },
    };
  },
}));

jest.mock("@/lib/marketplaceRbac", () => ({
  requireFleetMarketplaceAccess: () => async () => ({
    supabaseUser: { id: "auth-test" },
    dbUser: { id: mockUserId, role: "rider" },
    memberships: [{ fleet_id: mockFleetId, role: mockBidRole }],
  }),
}));

jest.mock("@/lib/ambulanceCerts", () => ({
  fleetHasVerifiedCertPair: async () => true,
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: async () => true,
  getConfigInt: async (_key: string, fallback: number) => fallback,
}));

jest.mock("@/lib/wsNotify", () => ({
  notifyWs: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function bidRequest(body: unknown) {
  return new Request("http://localhost/api/rental/bids", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const bidBody = {
  request_id: mockReqId,
  fleet_id: mockFleetId,
  vehicle_type: "van",
  quoted_price_bdt: 50000,
};

function openCarRentalRequest() {
  return {
    id: mockReqId,
    status: "broadcasting",
    category: "car_rental",
    service_level: null,
    tracking_required: false,
    soft_deadline_at: new Date(Date.now() + 60 * 60 * 1000),
    bidding_window_seconds: 1200,
    rider_user_id: "rider-1",
  };
}

beforeEach(() => {
  mockBidRole = "OWNER";
  mockFleetMemberOk = true;
  mockReqRow = openCarRentalRequest();
  mockAssignmentRows = [];
  mockInsertCalls = [];
  mockUpdateCalls = [];
});

describe("C8-3 — bid submit role array", () => {
  it("VIEWER membership → 403 forbidden, no bid written", async () => {
    mockBidRole = "VIEWER";
    const res = await submitBid(bidRequest(bidBody));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "forbidden",
      message: "Bidding requires an OWNER, MANAGER, or DISPATCHER fleet role",
    });
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("ACCOUNTANT membership → 403 forbidden", async () => {
    mockBidRole = "ACCOUNTANT";
    const res = await submitBid(bidRequest(bidBody));
    expect(res.status).toBe(403);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("DISPATCHER membership → 201 bid submitted", async () => {
    mockBidRole = "DISPATCHER";
    const res = await submitBid(bidRequest(bidBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bid_id).toBe("generated-bid-uuid");
  });

  it("MANAGER membership → 201 bid submitted", async () => {
    mockBidRole = "MANAGER";
    const res = await submitBid(bidRequest(bidBody));
    expect(res.status).toBe(201);
  });
});

describe("C8-2 — pure business-fleet owner bids + acks (no drivers row)", () => {
  it("OWNER with no drivers row anywhere → 201 bid submitted", async () => {
    mockBidRole = "OWNER";
    // NOTE: the mock drivers table is permanently empty — there is no
    // drivers row for this caller in any fleet, the stranded-population
    // shape. The bid path never consults it (no driver_user_id in body).
    const res = await submitBid(bidRequest(bidBody));
    expect(res.status).toBe(201);
  });

  it("same owner acks the awarded tracking request → 200 acknowledged", async () => {
    mockReqRow = {
      ...openCarRentalRequest(),
      status: "awarded",
      tracking_required: true,
      fleet_ack_at: null,
      rider_user_id: "rider-1",
    };
    mockAssignmentRows = [{ fleet_id: mockFleetId }];
    const res = await fleetAck(
      new Request("http://localhost/api/test", { method: "POST" }),
      { id: mockReqId },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Fleet acknowledged" });
  });
});
