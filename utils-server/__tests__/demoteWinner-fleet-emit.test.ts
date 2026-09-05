/**
 * TDD RED for the implementation lane's Z2 fix (finding:
 * .kilo/plans/findings/2026-09-05-postrow-demoted-fleet-emit.md).
 *
 * demoteWinner's collecting path re-reads awarded_bid_id AFTER the tx nulls
 * it, so postRow.awarded_bid_id is always null and the demoted winning fleet
 * never receives the rental:status emit (only the rider does).
 *
 * Declared with test.failing: the suite stays green today (proving the bug),
 * and flips RED the moment the implementation agent's fix makes the test pass
 * — the fix commit then flips test.failing → test in the same commit.
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

import { db } from "../../src/db";
import { rentalRequests } from "../../src/db/schema";
import { sendToBidder, sendToFleetMembers } from "../rentalHandler";
import { demoteWinner } from "../rentalDispatchChain";

type Row = Record<string, unknown>;

const REQUEST_ID = "11111111-1111-4111-a111-111111111111";
const DEMOTED_BID_ID = "22222222-2222-4222-8222-222222222222";
const DEMOTED_FLEET_ID = "fleet-1";

function scriptTxAndPostRead(): void {
  let selectCall = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    // call 0 (in-tx): request row · call 1 (in-tx): live assignment ·
    // call 2 (in-tx): standing-bid count · call 3 (post-tx): postRow ·
    // call 4 (post-tx): winning-bid fleet lookup
    selectCall++;
    const rows: Row[] =
      selectCall === 1
        ? [{ id: REQUEST_ID, status: "awarded", awarded_bid_id: DEMOTED_BID_ID }]
        : selectCall === 2
          ? [{ assigned_driver_user_id: null }]
          : selectCall === 3
            ? [{ cnt: 2 }]
            : selectCall === 4
              ? [{ awarded_bid_id: DEMOTED_BID_ID }] // the value the tx saw pre-null
              : [{ fleet_id: DEMOTED_FLEET_ID }];
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
  test.failing(
    "collecting demotion emits rental:status to the DEMOTED fleet, not just the rider",
    async () => {
      const result = await demoteWinner(REQUEST_ID, "sla_timeout");
      expect(result).toMatchObject({ ok: true, nextStatus: "collecting" });

      // rider notified
      expect(sendToBidder).toHaveBeenCalled();
      // THE GAP: the demoted winning fleet must also be notified with its
      // fleet id. Today the postRow re-read sees the already-nulled
      // awarded_bid_id, so the fleet lookup never runs.
      expect(sendToFleetMembers).toHaveBeenCalledWith(
        DEMOTED_FLEET_ID,
        "rental:status",
        expect.objectContaining({ request_id: REQUEST_ID, status: "collecting" }),
      );
      void rentalRequests;
    },
  );
});
