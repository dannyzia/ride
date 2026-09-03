// @ts-nocheck — Jest mock factories produce untyped DB/module chains; runtime
// behavior is what's under test.
/**
 * Batch-2 utils-server fix tests.
 *
 * N14 — emergencyChain.transitionEmergencyRequest relays the status change to
 *       the caller strictly AFTER the transaction commits (a rolled-back tx
 *       must never emit).
 * N11 — activationJobs (jobs 54/55) pass deterministic idempotency keys to
 *       sendNotification so watermark re-broadcasts (TD-15 restart recovery)
 *       never double-push.
 */
const mockSeq: string[] = [];

jest.mock("../../src/db", () => {
  const schema = require("../../src/db/schema");
  const T = {
    emergency: schema.emergencyRequests,
    certs: schema.ambulanceCertifications,
    rental: schema.rentalRequests,
    delivery: schema.deliveryRequests,
    fleetMembers: schema.fleetMembers,
    shopOrders: schema.shopOrders,
    fleets: schema.fleets,
  };

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = async () => rows;
    c.orderBy = () => c;
    c.groupBy = () => c;
    c.for = async () => rows;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  let mockEmergencyRows: Record<string, unknown>[] = [];
  let mockCertRows: Record<string, unknown>[] = [];
  let mockRentalRows: Record<string, unknown>[] = [];
  let mockDeliveryRows: Record<string, unknown>[] = [];
  let mockMemberRows: Record<string, unknown>[] = [];
  let mockShopRows: Record<string, unknown>[] = [];

  const fromQ = (t: unknown) => {
    const resolveRows = () => {
      if (t === T.emergency) return mockEmergencyRows;
      if (t === T.certs) return mockCertRows;
      if (t === T.rental) return mockRentalRows;
      if (t === T.delivery) return mockDeliveryRows;
      if (t === T.fleetMembers) return mockMemberRows;
      if (t === T.shopOrders) return mockShopRows;
      return [];
    };
    const q: any = {};
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.where = () => chainable(resolveRows());
    return q;
  };

  const makeSelect = () => (..._sargs: unknown[]) => ({ from: (t: unknown) => fromQ(t) });

  const makeTx = () => ({
    select: makeSelect(),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{ id: "updated-1", ...vals }],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: "inserted-1" }] }),
    }),
  });

  const dbMock: any = {
    select: makeSelect(),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: "inserted-1" }] }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{ id: "updated-1", ...vals }],
        }),
      }),
    }),
    transaction: async (fn: (tx: unknown) => unknown) => {
      const result = await fn(makeTx());
      mockSeq.push("commit");
      return result;
    },
  };
  dbMock.__setMockRows = (patch: Record<string, Record<string, unknown>[]>) => {
    if (patch.emergency) mockEmergencyRows = patch.emergency;
    if (patch.certs) mockCertRows = patch.certs;
    if (patch.rental) mockRentalRows = patch.rental;
    if (patch.delivery) mockDeliveryRows = patch.delivery;
    if (patch.fleetMembers) mockMemberRows = patch.fleetMembers;
    if (patch.shopOrders) mockShopRows = patch.shopOrders;
  };
  return { db: dbMock };
});

jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../emergencyBus", () => ({
  emergencySendToUser: (..._a: unknown[]) => {
    mockSeq.push("emit");
  },
}));

jest.mock("../../lib/notify", () => ({
  sendNotification: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }),
}));

jest.mock("../../lib/ambulanceCerts", () => ({
  getEligibleEmergencyDriverUserIds: jest.fn().mockResolvedValue([]),
  serviceLevelSatisfies: () => true,
  fleetHasVerifiedCertPair: async () => true,
}));

jest.mock("../rentalHandler", () => ({
  getConnectedBidderIds: () => [],
  sendToBidder: jest.fn(),
}));

jest.mock("../rentalDispatchChain", () => ({
  getEligibleFleets: jest.fn().mockResolvedValue(["f1"]),
}));

jest.mock("../deliveryHandler", () => ({
  broadcastToCouriers: jest.fn(),
  sendToCourier: jest.fn(),
}));

jest.mock("../index", () => ({
  sendToUser: jest.fn(),
}));

const { db } = require("../../src/db");
const { transitionEmergencyRequest } = require("../emergencyChain");
const { activateRentalRequests, activateDeliveryRequests } = require("../activationJobs");
const { sendNotification } = require("../../lib/notify");

// ══════════════════════════════════════════════════════════════════════
// N14 — WS relay strictly after commit
// ══════════════════════════════════════════════════════════════════════
describe("N14 — transitionEmergencyRequest emits after commit", () => {
  beforeEach(() => {
    mockSeq.length = 0;
    (sendNotification as any).mockClear?.();
    db.__setMockRows({
      emergency: [
        {
          id: "req-1",
          status: "assigned",
          caller_user_id: "caller-1",
          accepted_cert_id: "cert-1",
        },
      ],
      certs: [{ id: "cert-1", user_id: "driver-1" }],
    });
  });

  it("commit is recorded before the emit — the relay cannot fire inside the tx", async () => {
    const result = await transitionEmergencyRequest("req-1", "driver-1", "en_route_pickup");
    expect(result.status).toBe("en_route_pickup");
    expect(mockSeq).toEqual(["commit", "emit"]);
  });
});

// ══════════════════════════════════════════════════════════════════════
// N11 — activation pushes carry deterministic idempotency keys
// ══════════════════════════════════════════════════════════════════════
describe("N11 — activation jobs pass idempotency keys to sendNotification", () => {
  beforeEach(() => {
    mockSeq.length = 0;
    (sendNotification as any).mockClear?.();
    db.__setMockRows({
      rental: [
        {
          id: "rreq-1",
          status: "broadcasting",
          created_at: new Date(),
          urgency: "alarm",
          category: "truck_rental",
          pickup_address: "Sector 7",
        },
      ],
      fleetMembers: [{ user_id: "member-1", fleet_id: "f1" }],
      delivery: [
        {
          id: "dreq-1",
          status: "pending",
          created_at: new Date(),
          source_shop_order_id: "order-1",
        },
      ],
      shopOrders: [{ id: "order-1", rider_user_id: "rider-1" }],
    });
  });

  it("job 54 rental activation uses rental_activation:{request_id}:{user_id}", async () => {
    await activateRentalRequests();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [userId, , , , data, options] = (sendNotification as any).mock.calls[0];
    expect(userId).toBe("member-1");
    expect(data.request_id).toBe("rreq-1");
    expect(options.idempotencyKey).toBe("rental_activation:rreq-1:member-1");
  });

  it("job 55 delivery-created push uses delivery_created:{request_id}", async () => {
    await activateDeliveryRequests();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [userId, , , , data, options] = (sendNotification as any).mock.calls[0];
    expect(userId).toBe("rider-1");
    expect(options.idempotencyKey).toBe("delivery_created:dreq-1");
  });
});
