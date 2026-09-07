/**
 * Demoted-fleet WS emit for demoteWinner's collecting path — the GREEN
 * counterpart to finding 2026-09-05-postrow-demoted-fleet-emit.
 *
 * History: the original postRow block re-read awarded_bid_id AFTER the tx
 * nulled it, so the demoted fleet never received rental:status. The test
 * agent shipped that gap as a test.failing red; the implementation agent
 * landed Shape 2 (closure `demotedBidId` captured pre-null, post-tx fleet
 * lookup keyed on it) in e9bea6d, and this test was flipped test.failing →
 * test in the same pass.
 */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../lib/platformConfig", () => ({
  getConfigInt: jest.fn(async () => 10),
}));
jest.mock("../rentalHandler", () => ({
  sendToBidder: jest.fn(),
  sendToFleetMembers: jest.fn(),
}));
// M7: demoteWinner fires the customer push through the batched entry point.
jest.mock("../../lib/notify", () => ({
  sendNotifications: jest.fn(async () => []),
}));

import { db } from "../../src/db";
import { sendToBidder, sendToFleetMembers } from "../rentalHandler";
import { sendNotifications } from "../../lib/notify";
import { demoteWinner } from "../rentalDispatchChain";

type Row = Record<string, unknown>;

const REQUEST_ID = "11111111-1111-4111-a111-111111111111";
const DEMOTED_BID_ID = "22222222-2222-4222-8222-222222222222";
const DEMOTED_FLEET_ID = "fleet-1";
const LOSING_BID_ID = "33333333-3333-4333-8333-333333333333";
const LOSING_FLEET_ID = "fleet-2";

function scriptTxAndPostRead(): void {
  let selectCall = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    // call 1 (in-tx): request row · call 2 (in-tx): live assignment ·
    // call 3 (in-tx): standing-bid count · call 4 (post-tx): winning-bid
    // fleet lookup (keyed on the closure demotedBidId) · call 5: emitRentalStatus
    // owner lookup. (Ruling B: the M7 losing-bid-set select was removed —
    // re-standing bidders get no bid_settled.)
    selectCall++;
    const rows: Row[] =
      selectCall === 1
        ? [{ id: REQUEST_ID, status: "awarded", awarded_bid_id: DEMOTED_BID_ID, rider_user_id: "rider-1", urgency: "alarm" }]
        : selectCall === 2
          ? [{ assigned_driver_user_id: null }]
          : selectCall === 3
            ? [{ cnt: 2 }]
            : selectCall === 4
              ? [{ fleet_id: DEMOTED_FLEET_ID }]
              : [{ rider_user_id: "rider-1" }];
    const chain: any = {
      from: () => chain,
      where: () => chain,
      for: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });

  (db.update as jest.Mock).mockImplementation(() => ({
    set: jest.fn(() => ({
      where: jest.fn(async () => []),
    })),
  }));
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn(async () => []),
  }));
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
}

beforeEach(() => {
  jest.clearAllMocks();
  scriptTxAndPostRead();
});

describe("demoteWinner — demoted-fleet WS emit (Z2 finding)", () => {
  test("collecting demotion emits rental:status to BOTH the rider and the demoted fleet", async () => {
    const result = await demoteWinner(REQUEST_ID, "sla_timeout");
    expect(result).toMatchObject({ ok: true, nextStatus: "collecting" });

    expect(sendToBidder).toHaveBeenCalled();
    // the fix: the demoted winning fleet is resolved from the bid id captured
    // pre-null and notified with its fleet id
    expect(sendToFleetMembers).toHaveBeenCalledWith(
      DEMOTED_FLEET_ID,
      "rental:status",
      expect.objectContaining({ request_id: REQUEST_ID, status: "collecting" }),
    );

    // M7 → Ruling B: bid_settled goes ONLY to the demoted winner's fleet
    // (won→lost). Re-standing bidders are suppressed — they keep the
    // request-level rental:status only.
    expect(sendToFleetMembers).toHaveBeenCalledWith(
      DEMOTED_FLEET_ID,
      "rental:bid_settled",
      expect.objectContaining({ request_id: REQUEST_ID, bid_id: DEMOTED_BID_ID, status: "lost" }),
    );
    const bidSettledCalls = (sendToFleetMembers as jest.Mock).mock.calls.filter(
      ([, event]: [string, string]) => event === "rental:bid_settled",
    );
    expect(bidSettledCalls).toHaveLength(1);
    expect(bidSettledCalls[0][0]).toBe(DEMOTED_FLEET_ID);
    expect(sendToFleetMembers).not.toHaveBeenCalledWith(
      LOSING_FLEET_ID,
      "rental:bid_settled",
      expect.anything(),
    );

    // M7: the customer gets a push (alarm channel — urgency='alarm' fixture).
    expect(sendNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "rider-1",
          type: "alarm",
          idempotencyKey: `rental_demote:${REQUEST_ID}:collecting`,
        }),
      ]),
    );
  });

  test("no_bidders demotion emits to the rider with no fleet", async () => {
    let selectCall = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      selectCall++;
      const rows: Row[] =
        selectCall === 1
          ? [{ id: REQUEST_ID, status: "awarded", awarded_bid_id: DEMOTED_BID_ID, rider_user_id: "rider-1" }]
          : selectCall === 2
            ? [{ assigned_driver_user_id: null }]
            : selectCall === 3
              ? [{ cnt: 0 }] // no standing bids → no_bidders
              : [{ rider_user_id: "rider-1" }];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        for: () => chain,
        limit: async () => rows,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    });

    const result = await demoteWinner(REQUEST_ID, "fleet_ack_timeout");
    expect(result).toMatchObject({ ok: true, nextStatus: "no_bidders" });
    expect(sendToBidder).toHaveBeenCalled();
    expect(sendToFleetMembers).not.toHaveBeenCalled(); // nothing was demoted-and-reselected
  });
});
