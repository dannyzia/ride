// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (Phase 5 precedent, tests/api/rental/truck-rental.test.ts).
/**
 * Batch-1 security fix tests (N1, N2, N6, N7).
 * Invokes the REAL handlers; only DB/auth/logger are mocked.
 * DB mock is a chainable awaitable query builder (where/orderBy/limit/for/innerJoin/groupBy).
 */

import { GET as getRequest, POST as cancelRequest, PATCH as patchTerms } from "@/app/api/rental/requests/[id]+api";
import { POST as submitBid } from "@/app/api/rental/bids+api";
import { POST as acceptBid } from "@/app/api/rental/requests/[id]/accept-bid+api";
import { POST as createRequest } from "@/app/api/rental/requests+api";
import { GET as getBid } from "@/app/api/rental/bids/[id]+api";
import { POST as confirmRequest } from "@/app/api/rental/requests/[id]/confirm+api";
import { POST as completeBid } from "@/app/api/rental/bids/[id]/complete+api";
import { POST as pickAssignment } from "@/app/api/rental/assignments/[id]/pick+api";
import { POST as fleetAck } from "@/app/api/rental/requests/[id]/fleet-ack+api";
import { notifyWs } from "@/lib/wsNotify";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const mockReqUuid = "00000000-0000-4000-8000-000000000001";
const mockUserUuid = "00000000-0000-4000-8000-000000000002";
const mockOtherUserUuid = "00000000-0000-4000-8000-000000000003";
const mockFleetUuid = "00000000-0000-4000-8000-000000000004";
const mockDriverUuid = "00000000-0000-4000-8000-000000000005";
const mockVehicleUuid = "00000000-0000-4000-8000-000000000006";
const mockBidUuid = "00000000-0000-4000-8000-000000000007";

let mockReqRows: Record<string, unknown>[] = [];
let mockBidRows: Record<string, unknown>[] = [];
let mockDriverRows: Record<string, unknown>[] = [];
let mockVehicleRows: Record<string, unknown>[] = [];
let mockFleetSubRows: Record<string, unknown>[] = [];
let mockInsertCalls: Record<string, unknown>[] = [];
let mockUpdateCalls: Record<string, unknown>[] = [];
let mockRateLimitCount = 0;
let mockOpenRequestCount = 0;
let mockAuthUser: { id: string; role: string } = { id: mockUserUuid, role: "rider" };
let mockAuthFail = false;
let mockVerticalEnabled = true;
let mockAssignmentRows: Record<string, unknown>[] = [];
let mockFleetMemberRows: Record<string, unknown>[] = [];
let mockFleetAuthOk = false;
let mockUpdateRows: Record<string, unknown>[] = [{ id: "generated-uuid" }];
let mockSelectReads = 0;

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    req: schema.rentalRequests,
    bids: schema.rentalBids,
    drivers: schema.drivers,
    vehicles: schema.vehicles,
    fleetSubs: schema.fleetSubscriptions,
    assignments: schema.awardedBidAssignments,
    fleetMembers: schema.fleetMembers,
  };

  // Chainable awaitable query result: supports .orderBy .limit .for .then.
  // limit/offset stay chainable (not promise-returning) so `.limit(1).for("update")`
  // composes; await resolves via `then`.
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

  // Build a from() continuation bound to a table; innerJoin keeps the same target
  const fromQ = (t: unknown, isCount: boolean) => {
    const resolveRows = () => {
      if (isCount) {
        return [{ cnt: t === T.req ? mockOpenRequestCount : 0 }];
      }
      if (t === T.req) return mockReqRows;
      if (t === T.bids) return mockBidRows;
      if (t === T.drivers) return mockDriverRows;
      if (t === T.vehicles) return mockVehicleRows;
      if (t === T.fleetSubs) return mockFleetSubRows;
      if (t === T.assignments) return mockAssignmentRows;
      if (t === T.fleetMembers) return mockFleetMemberRows;
      return [];
    };
    const q: any = {};
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.where = () => chainable(resolveRows());
    return q;
  };

  const makeSelect = () => (...sargs: unknown[]) => {
    mockSelectReads += 1;
    const isCount = !!(sargs[0] && typeof sargs[0] === "object" && "cnt" in (sargs[0] as object));
    return { from: (t: unknown) => fromQ(t, isCount) };
  };

  const makeInsert = () => () => ({
    values: (vals: Record<string, unknown>) => {
      mockInsertCalls.push(vals);
      return {
        onConflictDoUpdate: () => ({
          returning: async () => [{ count: (mockRateLimitCount ?? 0) + 1 }],
        }),
        returning: async () => [{ id: "generated-uuid" }],
      };
    },
  });

  const makeUpdate = () => () => ({
    set: (vals: Record<string, unknown>) => ({
      where: (...whereArgs: unknown[]) => {
        mockUpdateCalls.push({ vals, whereArgs });
        return { returning: async () => mockUpdateRows };
      },
    }),
  });

  const makeTx = () => ({
    insert: makeInsert(),
    update: makeUpdate(),
    select: makeSelect(),
  });

  return {
    db: {
      select: makeSelect(),
      insert: makeInsert(),
      update: makeUpdate(),
      transaction: async (fn: (tx: unknown) => unknown) => fn(makeTx()),
    },
  };
});

let mockLogErrors: string[] = [];

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: (...a: unknown[]) =>
      mockLogErrors.push(
        a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(" | "),
      ),
  },
}));

jest.mock("@/lib/auth", () => ({
  requireAnyRole:
    (_roles: string[]) =>
    async () => {
      if (mockAuthFail) {
        throw Object.assign(new Error("Authentication required"), { status: 401 });
      }
      return {
        supabaseUser: { id: "auth-test" },
        dbUser: mockAuthUser,
      };
    },
  requireFleetMember:
    (_fleetId: string, _roles?: readonly string[]) =>
    async () => {
      if (!mockFleetAuthOk) {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }
      return {
        supabaseUser: { id: "auth-test" },
        dbUser: mockAuthUser,
        membership: { id: "fm-1", fleet_id: _fleetId, role: "OWNER" },
      };
    },
}));

jest.mock("@/lib/ambulanceCerts", () => ({
  fleetHasVerifiedCertPair: async () => true,
  isVerifiedCertPair: async () => true,
  serviceLevelSatisfies: () => true,
}));

jest.mock("@/lib/marketplaceRbac", () => ({
  requireFleetMarketplaceAccess:
    () =>
    async () => ({
      supabaseUser: { id: "auth-test" },
      dbUser: mockAuthUser,
      memberships: [{ fleet_id: mockFleetUuid, role: "OWNER" }],
    }),
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: async () => mockVerticalEnabled,
  getConfigInt: async (_key: string, fallback: number) => fallback,
}));

jest.mock("@/lib/wsNotify", () => ({
  notifyWs: jest.fn(),
}));

function makeRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeRawRequest(method: string, rawBody: string | undefined) {
  return new Request("http://localhost/api/test", {
    method,
    headers: rawBody !== undefined ? { "content-type": "application/json" } : {},
    body: rawBody,
  });
}

const carRentalBody = {
  category: "car_rental",
  pickup_address: "Sector 7, Uttara",
  pickup_lat: 23.8103,
  pickup_lng: 90.4125,
  dropoff_address: "Chittagong Port",
  dropoff_lat: 22.32,
  dropoff_lng: 91.74,
};

// ══════════════════════════════════════════════════════════════════════
// N1 — GET /api/rental/requests/[id]
// ══════════════════════════════════════════════════════════════════════
describe("N1 — GET /api/rental/requests/[id]", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockBidRows = [];
    mockDriverRows = [];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("returns 400 invalid_uuid for a non-UUID id", async () => {
    const res = await getRequest(makeRequest("GET", null), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_uuid");
  });

  it("returns 403 for a non-owner non-admin viewer", async () => {
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockOtherUserUuid,
        status: "broadcasting",
        patient_condition: "critical",
      },
    ];
    const res = await getRequest(makeRequest("GET", null), { id: mockReqUuid });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("forbidden");
  });

  it("strips patient_condition for an admin viewer (non-owner readable)", async () => {
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockOtherUserUuid,
        status: "broadcasting",
        patient_condition: "critical",
      },
    ];
    mockAuthUser = { id: mockUserUuid, role: "admin" };
    const res = await getRequest(makeRequest("GET", null), { id: mockReqUuid });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.request.patient_condition).toBeUndefined();
  });

  it("keeps patient_condition for the owner", async () => {
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockUserUuid,
        status: "broadcasting",
        patient_condition: "stable",
      },
    ];
    const res = await getRequest(makeRequest("GET", null), { id: mockReqUuid });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.request.patient_condition).toBe("stable");
  });
});

// ══════════════════════════════════════════════════════════════════════
// N2 (submit) — POST /api/rental/bids cross-fleet driver/vehicle validation
// ══════════════════════════════════════════════════════════════════════
const trackingBidBody = {
  request_id: mockReqUuid,
  fleet_id: mockFleetUuid,
  vehicle_type: "car_compact",
  driver_user_id: mockDriverUuid,
  vehicle_id: mockVehicleUuid,
  quoted_price_bdt: 50000,
};

describe("N2 — POST /api/rental/bids (submit-side drivers/vehicles validation)", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockDriverRows = [];
    mockVehicleRows = [];
    mockInsertCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "driver" };
  });

  it("rejects a driver not in the bidding fleet with 403 invalid_driver", async () => {
    mockReqRows = [
      {
        id: mockReqUuid,
        status: "broadcasting",
        soft_deadline_at: new Date(Date.now() + 3_600_000),
        tracking_required: true,
        category: "car_rental",
      },
    ];
    mockDriverRows = []; // no active drivers row for (user, fleet)
    const res = await submitBid(makeRequest("POST", trackingBidBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("invalid_driver");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("rejects a vehicle not in the bidding fleet with 403 invalid_vehicle", async () => {
    mockReqRows = [
      {
        id: mockReqUuid,
        status: "broadcasting",
        soft_deadline_at: new Date(Date.now() + 3_600_000),
        tracking_required: true,
        category: "car_rental",
      },
    ];
    mockDriverRows = [{ id: mockDriverUuid }];
    mockVehicleRows = []; // no vehicles row for this fleet
    const res = await submitBid(makeRequest("POST", trackingBidBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("invalid_vehicle");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("inserts the bid in a §B.0 tx: bid + bid_submitted event + collecting flip", async () => {
    mockReqRows = [
      {
        id: mockReqUuid,
        status: "broadcasting",
        soft_deadline_at: new Date(Date.now() + 3_600_000),
        tracking_required: true,
        category: "car_rental",
      },
    ];
    mockDriverRows = [{ id: mockDriverUuid }];
    mockVehicleRows = [{ id: mockVehicleUuid }];
    const res = await submitBid(makeRequest("POST", trackingBidBody));
    expect(res.status).toBe(201);
    // N12: exactly two writes in the tx — the bid row and the audit event
    expect(mockInsertCalls).toHaveLength(2);
    const bidInsert = mockInsertCalls.find((v) => v.quoted_price_bdt === 50000);
    expect(bidInsert).toBeDefined();
    const eventInsert = mockInsertCalls.find((v) => v.event_type === "bid_submitted");
    expect(eventInsert).toBeDefined();
    expect(eventInsert.request_id).toBe(mockReqUuid);
    // §B.1: broadcasting → collecting on the first bid
    const flip = mockUpdateCalls.find((c) => c.vals.status === "collecting");
    expect(flip).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════
// N2 (accept) — POST /api/rental/requests/[id]/accept-bid in-tx re-check
// ══════════════════════════════════════════════════════════════════════
describe("N2 — POST /api/rental/requests/[id]/accept-bid (accept-side re-check)", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockBidRows = [];
    mockDriverRows = [];
    mockVehicleRows = [];
    mockFleetSubRows = [];
    mockInsertCalls = [];
    mockUpdateCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("rejects a bid whose driver is not in the winning fleet (403 in-tx)", async () => {
    mockReqRows = [
      {
        id: mockReqUuid,
        status: "collecting",
        rider_user_id: mockUserUuid,
        tracking_required: true,
      },
    ];
    mockBidRows = [
      {
        id: mockBidUuid,
        fleet_id: mockFleetUuid,
        status: "active",
        driver_user_id: mockDriverUuid,
        vehicle_id: mockVehicleUuid,
      },
    ];
    mockFleetSubRows = [
      {
        fleet_status: "ACTIVE",
        plan_features: { marketplace_bidding: true },
        current_period_end: new Date(Date.now() + 3_600_000),
      },
    ];
    mockDriverRows = []; // driver no longer active in fleet at accept time
    const res = await acceptBid(makeRequest("POST", { bid_id: mockBidUuid }), {
      id: mockReqUuid,
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("forbidden");
    // No award writes happened
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockInsertCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// M6 (audit-fix) — accept-bid losing-fleet bid_settled payload contract
// ══════════════════════════════════════════════════════════════════════
describe("M6 — accept-bid bid_settled carries each loser's OWN bid id + status 'lost'", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockBidRows = [];
    mockDriverRows = [];
    mockVehicleRows = [];
    mockFleetSubRows = [];
    mockInsertCalls = [];
    mockUpdateCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
    (notifyWs as jest.Mock).mockClear();
  });

  it("emits bid_settled with the losing bid's id, status 'lost', reason 'lost_to_competitor'", async () => {
    const losingFleetUuid = "00000000-0000-4000-8000-00000000000a";
    const losingBidUuid = "00000000-0000-4000-8000-00000000000b";
    mockReqRows = [
      {
        id: mockReqUuid,
        status: "collecting",
        rider_user_id: mockUserUuid,
        tracking_required: false,
      },
    ];
    mockBidRows = [
      {
        id: mockBidUuid,
        fleet_id: mockFleetUuid,
        status: "active",
        driver_user_id: null,
        vehicle_id: null,
      },
      {
        id: losingBidUuid,
        // The mock returns raw rows (no SQL projection), so the losing-bids
        // select ({ fleet_id, bid_id }) reads `bid_id` straight off the fixture.
        bid_id: losingBidUuid,
        fleet_id: losingFleetUuid,
        status: "superseded",
        driver_user_id: null,
        vehicle_id: null,
      },
    ];
    mockFleetSubRows = [
      {
        fleet_status: "ACTIVE",
        plan_features: { marketplace_bidding: true },
        current_period_end: new Date(Date.now() + 3_600_000),
      },
    ];
    const res = await acceptBid(makeRequest("POST", { bid_id: mockBidUuid }), {
      id: mockReqUuid,
    });
    expect(res.status).toBe(200);

    const settled = (notifyWs as jest.Mock).mock.calls[0][0].filter(
      (e: { event: string }) => e.event === "rental:bid_settled",
    );
    expect(settled).toHaveLength(1);
    // The losing fleet is told about ITS OWN bid — never the winner's bid id —
    // and the status is a legal §D value ('lost'), not the winner's 'awarded'.
    expect(settled[0].payload.bid_id).toBe(losingBidUuid);
    expect(settled[0].payload.bid_id).not.toBe(mockBidUuid);
    expect(settled[0].payload.status).toBe("lost");
    expect(settled[0].payload.reason).toBe("lost_to_competitor");
    expect(settled[0].to[0].fleet_id).toBe(losingFleetUuid);
  });
});

// ══════════════════════════════════════════════════════════════════════
// N6 — POST /api/rental/requests rate limiting (bar option 1)
// ══════════════════════════════════════════════════════════════════════
describe("N6 — POST /api/rental/requests rate limiting", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockInsertCalls = [];
    mockOpenRequestCount = 0;
    mockRateLimitCount = 0;
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("rejects with 429 too_many_open when open-request cap is exceeded", async () => {
    mockOpenRequestCount = 3; // cap is ≤3 open
    const res = await createRequest(makeRequest("POST", carRentalBody));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("too_many_open");
  });

  it("writes a rate_limits row keyed rental_create:{user_id} on a successful create", async () => {
    mockOpenRequestCount = 0;
    const res = await createRequest(makeRequest("POST", carRentalBody));
    expect(res.status).toBe(201);
    // First insert call is the rate_limits upsert
    expect(mockInsertCalls.length).toBeGreaterThan(0);
    expect(mockInsertCalls[0].key).toBe(`rental_create:${mockUserUuid}`);
  });
});

// ══════════════════════════════════════════════════════════════════════
// N7 — POST /api/rental/requests/[id] (cancel) settlement — R-2 complete
// ══════════════════════════════════════════════════════════════════════
describe("N7 — cancel from awarded settles bids and releases the assignment", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockUpdateCalls = [];
    mockInsertCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("settles active+won+superseded bids → lost with settled_at", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockUserUuid, status: "awarded" }];
    const res = await cancelRequest(
      makeRequest("POST", { cancel_reason: "changed plans" }),
      { id: mockReqUuid },
    );
    expect(res.status).toBe(200);

    const lostUpdate = mockUpdateCalls.find((c) => c.vals.status === "lost");
    expect(lostUpdate).toBeDefined();
    expect(lostUpdate.vals.settled_at).toBeDefined();

    // R-2(a): the bid-settlement WHERE must include superseded — rendered via
    // drizzle's own PgDialect so the assertion reads the real predicate params
    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(lostUpdate.whereArgs[0]);
    expect(rendered.params).toEqual(
      expect.arrayContaining(["active", "won", "superseded"]),
    );
  });

  it("releases the live assignment with release_reason=customer_cancelled (R-2b)", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockUserUuid, status: "awarded" }];
    const res = await cancelRequest(makeRequest("POST", {}), { id: mockReqUuid });
    expect(res.status).toBe(200);

    const release = mockUpdateCalls.find((c) => c.vals.release_reason === "customer_cancelled");
    expect(release).toBeDefined();
    expect(release.vals.released_at).toBeDefined();
    expect(release.vals.updated_at).toBeDefined();

    // request row: awarded_bid_id nulled on cancel
    const reqUpdate = mockUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(reqUpdate).toBeDefined();
    expect(reqUpdate.vals.awarded_bid_id).toBeNull();
  });

  it("still rejects cancellation from a terminal state (409)", async () => {
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockUserUuid,
        status: "completed",
      },
    ];
    const res = await cancelRequest(makeRequest("POST", {}), { id: mockReqUuid });
    expect(res.status).toBe(409);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// N5 — POST /api/rental/bids honors the vertical feature flag (§C.0)
// ══════════════════════════════════════════════════════════════════════
describe("N5 — bid submit respects marketplace_rental_enabled", () => {
  beforeEach(() => {
    mockVerticalEnabled = true;
    mockReqRows = [];
    mockDriverRows = [];
    mockVehicleRows = [];
    mockInsertCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "driver" };
  });

  it("rejects with 403 feature_disabled when the flag is off (no writes)", async () => {
    mockVerticalEnabled = false;
    const res = await submitBid(makeRequest("POST", trackingBidBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("feature_disabled");
    expect(mockInsertCalls).toHaveLength(0);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("proceeds when the flag is on", async () => {
    mockVerticalEnabled = true;
    mockReqRows = [
      {
        id: mockReqUuid,
        status: "broadcasting",
        soft_deadline_at: new Date(Date.now() + 3_600_000),
        tracking_required: true,
        category: "car_rental",
      },
    ];
    mockDriverRows = [{ id: mockDriverUuid }];
    mockVehicleRows = [{ id: mockVehicleUuid }];
    const res = await submitBid(makeRequest("POST", trackingBidBody));
    expect(res.status).toBe(201);
  });
});

// ══════════════════════════════════════════════════════════════════════
// N9 — PATCH terms: owner OR winning-fleet member (post-award, §C.2)
// ══════════════════════════════════════════════════════════════════════
describe("N9 — PATCH /api/rental/requests/[id] terms authorization", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockAssignmentRows = [];
    mockFleetMemberRows = [];
    mockUpdateCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "driver" };
  });

  it("owner updates terms (200)", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockUserUuid, status: "confirmed" }];
    const res = await patchTerms(
      makeRequest("PATCH", { terms: "fuel included" }),
      { id: mockReqUuid },
    );
    expect(res.status).toBe(200);
    const termsUpdate = mockUpdateCalls.find((c) => c.vals.negotiated_terms === "fuel included");
    expect(termsUpdate).toBeDefined();
  });

  it("winning-fleet member updates terms post-award (200)", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockOtherUserUuid, status: "awarded" }];
    mockAssignmentRows = [{ fleet_id: mockFleetUuid }]; // live assignment (released_at null)
    mockFleetMemberRows = [{ id: "fm-1" }]; // caller is an active member of the winning fleet
    const res = await patchTerms(
      makeRequest("PATCH", { terms: "driver waits at gate" }),
      { id: mockReqUuid },
    );
    expect(res.status).toBe(200);
  });

  it("non-owner non-member is rejected (403, no writes)", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockOtherUserUuid, status: "awarded" }];
    mockAssignmentRows = [{ fleet_id: mockFleetUuid }];
    mockFleetMemberRows = []; // caller has no membership in the winning fleet
    const res = await patchTerms(
      makeRequest("PATCH", { terms: "unauthorized edit" }),
      { id: mockReqUuid },
    );
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("non-owner with no live assignment is rejected (403)", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockOtherUserUuid, status: "awarded" }];
    mockAssignmentRows = []; // assignment released — no winning fleet to check
    const res = await patchTerms(
      makeRequest("PATCH", { terms: "unauthorized edit" }),
      { id: mockReqUuid },
    );
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════
// N16 — rank badges apply to LIVE bids only (ruling 9 / §F.2)
// ══════════════════════════════════════════════════════════════════════
describe("N16 — GET detail ranks live bids only", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockBidRows = [];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("settled bids carry no rank/badge; live bids rank low→high", async () => {
    mockReqRows = [
      { id: mockReqUuid, rider_user_id: mockUserUuid, status: "awarded" },
    ];
    const bidA = "00000000-0000-4000-8000-00000000000a";
    const bidB = "00000000-0000-4000-8000-00000000000b";
    const bidC = "00000000-0000-4000-8000-00000000000c";
    mockBidRows = [
      { id: bidA, fleet_id: mockFleetUuid, status: "active", quoted_price_bdt: 30000 },
      { id: bidB, fleet_id: mockFleetUuid, status: "lost", quoted_price_bdt: 20000 },
      { id: bidC, fleet_id: mockFleetUuid, status: "active", quoted_price_bdt: 40000 },
    ];
    const res = await getRequest(makeRequest("GET", null), { id: mockReqUuid });
    expect(res.status).toBe(200);
    const json = await res.json();
    const byId = new Map(json.bids.map((b: { id: string }) => [b.id, b]));
    // lowest LIVE bid → Best; the cheaper settled bid gets nothing
    expect(byId.get(bidA).rank).toBe(1);
    expect(byId.get(bidA).rank_badge).toBe("Best");
    expect(byId.get(bidB).rank).toBeNull();
    expect(byId.get(bidB).rank_badge).toBeNull();
    expect(byId.get(bidC).rank).toBe(2);
    expect(byId.get(bidC).rank_badge).toBe("2nd");
  });
});

// ══════════════════════════════════════════════════════════════════════
// N19 — request create: auth precedes the feature flag
// ══════════════════════════════════════════════════════════════════════
describe("N19 — POST /api/rental/requests auth-before-flag ordering", () => {
  beforeEach(() => {
    mockAuthFail = false;
    mockVerticalEnabled = true;
    mockOpenRequestCount = 0;
    mockRateLimitCount = 0;
    mockInsertCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("unauthenticated caller gets 401 even when the flag is off (no probe)", async () => {
    mockAuthFail = true;
    mockVerticalEnabled = false;
    const res = await createRequest(makeRequest("POST", carRentalBody));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("unauthorized");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("authenticated caller with flag off gets 403 feature_disabled", async () => {
    mockVerticalEnabled = false;
    const res = await createRequest(makeRequest("POST", carRentalBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("feature_disabled");
  });
});

// ══════════════════════════════════════════════════════════════════════
// N17 — cancel body handling: bodyless proceeds, present-invalid rejects
// ══════════════════════════════════════════════════════════════════════
describe("N17 — cancel distinguishes absent body from present-invalid body", () => {
  beforeEach(() => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockUserUuid, status: "awarded" }];
    mockUpdateCalls = [];
    mockInsertCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("bodyless cancel proceeds (200, settlement runs)", async () => {
    const res = await cancelRequest(makeRawRequest("POST", undefined), { id: mockReqUuid });
    expect(res.status).toBe(200);
    expect(mockUpdateCalls.find((c) => c.vals.status === "lost")).toBeDefined();
  });

  it("present-but-invalid JSON body → 400 invalid_json, no writes", async () => {
    const res = await cancelRequest(makeRawRequest("POST", "not-json{{"), { id: mockReqUuid });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_json");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("present-but-wrong-shape body → 400 validation_error, no writes", async () => {
    const res = await cancelRequest(
      makeRawRequest("POST", JSON.stringify({ cancel_reason: 123 })),
      { id: mockReqUuid },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_error");
    expect(mockUpdateCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// A1 — GET /api/rental/bids/[id]: sealed-bid ownership (audit #1)
// ══════════════════════════════════════════════════════════════════════
describe("A1 — GET /api/rental/bids/[id] ownership", () => {
  const bidId = mockBidUuid;
  const fullBid = {
    id: bidId,
    request_id: mockReqUuid,
    submitted_by_user_id: mockDriverUuid,
    fleet_id: mockFleetUuid,
    driver_user_id: mockDriverUuid,
    vehicle_id: mockVehicleUuid,
    quoted_price_bdt: 50000,
    status: "active",
  };

  beforeEach(() => {
    mockBidRows = [];
    mockUpdateCalls = [];
    mockInsertCalls = [];
    mockFleetAuthOk = false;
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("returns 400 invalid_uuid for a garbage id (zero DB reads)", async () => {
    const res = await getBid(makeRequest("GET", null), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_uuid");
  });

  it("rejects a random authenticated rider with 403 (no writes)", async () => {
    mockBidRows = [{ ...fullBid }]; // submitted by someone else
    const res = await getBid(makeRequest("GET", null), { id: bidId });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("admits the submitter (200, full row shape unchanged)", async () => {
    mockBidRows = [{ ...fullBid }];
    mockAuthUser = { id: mockDriverUuid, role: "driver" };
    const res = await getBid(makeRequest("GET", null), { id: bidId });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bid.quoted_price_bdt).toBe(50000);
    expect(json.bid.fleet_id).toBe(mockFleetUuid);
  });

  it("admits an active staff member of the bidding fleet (200)", async () => {
    mockBidRows = [{ ...fullBid }];
    mockFleetAuthOk = true;
    const res = await getBid(makeRequest("GET", null), { id: bidId });
    expect(res.status).toBe(200);
  });

  it("rejects a member of another fleet with 403", async () => {
    mockBidRows = [{ ...fullBid }];
    mockFleetAuthOk = false; // requireFleetMember(bid.fleet_id) fails
    const res = await getBid(makeRequest("GET", null), { id: bidId });
    expect(res.status).toBe(403);
  });

  it("admits an admin (200)", async () => {
    mockBidRows = [{ ...fullBid }];
    mockAuthUser = { id: mockUserUuid, role: "admin" };
    const res = await getBid(makeRequest("GET", null), { id: bidId });
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════
// A3 — POST /api/rental/requests/[id]/confirm: locked guards (audit #3)
// ══════════════════════════════════════════════════════════════════════
describe("A3 — POST /api/rental/requests/[id]/confirm", () => {
  const future = new Date(Date.now() + 3_600_000);
  const past = new Date(Date.now() - 3_600_000);

  beforeEach(() => {
    mockReqRows = [];
    mockAssignmentRows = [];
    mockUpdateCalls = [];
    mockInsertCalls = [];
    mockUpdateRows = [{ id: "generated-uuid" }];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  const awardedRow = (over: Record<string, unknown> = {}) => ({
    id: mockReqUuid,
    rider_user_id: mockUserUuid,
    status: "awarded",
    confirmation_deadline_at: future,
    tracking_required: false,
    fleet_ack_at: null,
    ...over,
  });

  it("confirms a fulfilled awarded request (200 + customer_confirmed event)", async () => {
    mockReqRows = [awardedRow()];
    mockAssignmentRows = [{ assigned_driver_user_id: mockDriverUuid, released_at: null }];
    const res = await confirmRequest(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(200);

    const confirmedUpdate = mockUpdateCalls.find((c) => c.vals.status === "confirmed");
    expect(confirmedUpdate).toBeDefined();
    expect(confirmedUpdate.vals.confirmed_at).toBeDefined();

    // conditional WHERE must pin status='awarded' (PgDialect-rendered params)
    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(confirmedUpdate!.whereArgs[0]);
    expect(rendered.params).toEqual(expect.arrayContaining([mockReqUuid, "awarded"]));

    const event = mockInsertCalls.find((v) => v.event_type === "customer_confirmed");
    expect(event).toBeDefined();
    expect(event.request_id).toBe(mockReqUuid);
  });

  it("SLA-sweep released the assignment before the tx → 409 assignment_pending, zero writes", async () => {
    mockReqRows = [awardedRow()];
    mockAssignmentRows = []; // live assignment released between read and tx
    const res = await confirmRequest(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("assignment_pending");
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("tracking fork without fleet ack → 409 fleet_ack_pending, zero writes", async () => {
    mockReqRows = [awardedRow({ tracking_required: true, fleet_ack_at: null })];
    mockAssignmentRows = [{ assigned_driver_user_id: mockDriverUuid, released_at: null }];
    const res = await confirmRequest(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("fleet_ack_pending");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("elapsed confirmation window → 409 confirm_window_elapsed, zero writes", async () => {
    mockReqRows = [awardedRow({ confirmation_deadline_at: past })];
    mockAssignmentRows = [{ assigned_driver_user_id: mockDriverUuid, released_at: null }];
    const res = await confirmRequest(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("confirm_window_elapsed");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("request flipped away from awarded inside the tx → 409, zero event writes", async () => {
    mockReqRows = [awardedRow()];
    mockAssignmentRows = [{ assigned_driver_user_id: mockDriverUuid, released_at: null }];
    mockUpdateRows = []; // conditional UPDATE matched 0 rows (racing cancel)
    const res = await confirmRequest(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockInsertCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// A7 — POST /api/rental/bids/[id]/complete: silent no-op closed (audit #9)
// ══════════════════════════════════════════════════════════════════════
describe("A7 — POST /api/rental/bids/[id]/complete", () => {
  beforeEach(() => {
    mockBidRows = [];
    mockReqRows = [];
    mockAssignmentRows = [];
    mockUpdateCalls = [];
    mockInsertCalls = [];
    mockUpdateRows = [{ id: "generated-uuid" }];
    mockAuthUser = { id: mockDriverUuid, role: "driver" };
  });

  it("completes a confirmed request (200 + completed event)", async () => {
    mockBidRows = [
      { id: mockBidUuid, request_id: mockReqUuid, fleet_id: mockFleetUuid, status: "won" },
    ];
    // M2 (audit-fix): the new awarded-fleet gate reads the LIVE assignment
    // (released_at IS NULL) and requires winning_bid_id === bid.id.
    mockAssignmentRows = [
      { assigned_driver_user_id: mockDriverUuid, winning_bid_id: mockBidUuid, released_at: null },
    ];
    mockReqRows = [{ id: mockReqUuid, status: "confirmed" }];

    const res = await completeBid(makeRequest("POST", null), { id: mockBidUuid });
    expect(res.status).toBe(200);

    const completedUpdate = mockUpdateCalls.find((c) => c.vals.status === "completed");
    expect(completedUpdate).toBeDefined();
    const event = mockInsertCalls.find((v) => v.event_type === "completed");
    expect(event).toBeDefined();
  });

  it("status flipped to cancelled between read and tx → 409, zero writes on bids/events", async () => {
    mockBidRows = [
      { id: mockBidUuid, request_id: mockReqUuid, fleet_id: mockFleetUuid, status: "won" },
    ];
    mockAssignmentRows = [
      { assigned_driver_user_id: mockDriverUuid, winning_bid_id: mockBidUuid, released_at: null },
    ];
    mockReqRows = [{ id: mockReqUuid, status: "confirmed" }];
    mockUpdateRows = []; // racing cancel: conditional UPDATE matched 0 rows

    const res = await completeBid(makeRequest("POST", null), { id: mockBidUuid });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockInsertCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// B6 — PATCH /api/rental/requests/[id] terms: tx-wrapped doc-only write
// ══════════════════════════════════════════════════════════════════════
describe("B6 — PATCH /api/rental/requests/[id] terms (tx discipline)", () => {
  beforeEach(() => {
    mockReqRows = [];
    mockUpdateCalls = [];
    mockAuthUser = { id: mockUserUuid, role: "rider" };
  });

  it("owner PATCH updates terms through the tx (200 + recorded write)", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockUserUuid, status: "confirmed" }];
    const res = await patchTerms(
      makeRequest("PATCH", { terms: "fuel included, tolls extra" }),
      { id: mockReqUuid },
    );
    expect(res.status).toBe(200);
    const update = mockUpdateCalls.find((c) => c.vals.negotiated_terms === "fuel included, tolls extra");
    expect(update).toBeDefined();
    expect(update!.vals.updated_at).toBeDefined();
  });

  it("terms body > 2000 chars → 400, zero writes", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockUserUuid, status: "confirmed" }];
    const res = await patchTerms(
      makeRequest("PATCH", { terms: "x".repeat(2001) }),
      { id: mockReqUuid },
    );
    expect(res.status).toBe(400);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("outsider PATCH is rejected with 403 and zero writes (auth unchanged)", async () => {
    mockReqRows = [{ id: mockReqUuid, rider_user_id: mockOtherUserUuid, status: "awarded" }];
    mockAssignmentRows = [{ fleet_id: mockFleetUuid }];
    mockFleetMemberRows = [];
    const res = await patchTerms(makeRequest("PATCH", { terms: "nope" }), { id: mockReqUuid });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// B7 — UUID guards ×3 (pick / confirm / fleet-ack)
// ══════════════════════════════════════════════════════════════════════
describe("B7 — UUID guards on rental assignment/request subroutes", () => {
  const badId = "not-a-uuid";

  beforeEach(() => {
    mockSelectReads = 0;
    mockUpdateCalls = [];
    mockInsertCalls = [];
  });

  it("pick: garbage id → 400 invalid_uuid with zero DB reads and zero writes", async () => {
    const res = await pickAssignment(
      makeRequest("POST", { driver_user_id: mockDriverUuid, vehicle_id: mockVehicleUuid }),
      { id: badId },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_uuid");
    expect(mockSelectReads).toBe(0);
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("confirm: garbage id → 400 invalid_uuid with zero DB reads and zero writes", async () => {
    const res = await confirmRequest(makeRequest("POST", null), { id: badId });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_uuid");
    expect(mockSelectReads).toBe(0);
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("fleet-ack: garbage id → 400 invalid_uuid with zero DB reads and zero writes", async () => {
    const res = await fleetAck(makeRequest("POST", null), { id: badId });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_uuid");
    expect(mockSelectReads).toBe(0);
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockInsertCalls).toHaveLength(0);
  });
});
