/**
 * Regression tests for the chat/message ID-space fix (audit D-1):
 *  - a DRIVER participant can send chat (previously the participation check
 *    compared ride.driver_id (a drivers.id) against sender.id (a users.id),
 *    so drivers always got 403)
 *  - the real-time recipient push resolves the driver's users.id (previously
 *    ride.driver_id was sent as recipient_user_id, which matches no connected
 *    user — the message persisted but the push vanished)
 *  - non-participants are rejected
 *
 * verifySupabaseToken, the DB, and fetch are mocked; parseJsonBody (real) is
 * driven by a fake Request whose json() returns the chat body.
 */
/* eslint-disable import/first */
jest.mock("../auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn() },
}));

import { db } from "../../src/db";
import { users, rides, drivers } from "../../src/db/schema";
import { verifySupabaseToken } from "../auth";
import { POST } from "../../app/api/chat/message+api";

const RIDE_ID = "11111111-1111-4111-8111-111111111111";

// Responses keyed by table identity (real schema objects).
const BY_TABLE = new Map<unknown, Record<string, unknown>[]>();

beforeEach(() => {
  BY_TABLE.clear();
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supa-uid-1" });

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => {
      const rows = () => BY_TABLE.get(table) ?? [];
      return {
        where: jest.fn(() => ({
          limit: jest.fn(async (n: number) => rows().slice(0, n)),
        })),
      };
    }),
  }));

  (db.insert as jest.Mock).mockImplementation((_table: unknown) => ({
    values: jest.fn((values: Record<string, unknown>) => ({
      returning: jest.fn(async () => [values]),
    })),
  }));
});

function chatRequest(): Request {
  return {
    json: async () => ({ ride_id: RIDE_ID, content: "hello" }),
  } as unknown as Request;
}

describe("chat/message — ID-space participation check", () => {
  test("a driver participant can send (driver_id is drivers.id, sender.id is users.id)", async () => {
    BY_TABLE.set(users, [{ id: "driver-user-1" }]);
    BY_TABLE.set(rides, [{ id: RIDE_ID, user_id: "rider-user-1", driver_id: "driver-1" }]);
    BY_TABLE.set(drivers, [{ id: "driver-1", user_id: "driver-user-1" }]);

    const res = await POST(chatRequest());
    expect(res.status).toBe(201);

    const insertMock = db.insert as jest.Mock;
    const values = insertMock.mock.results[0].value.values.mock.calls[0][0];
    expect(values).toMatchObject({
      ride_id: RIDE_ID,
      sender_id: "driver-user-1",
      content: "hello",
    });
  });

  test("rider sender's recipient push uses the driver's users.id, not drivers.id", async () => {
    process.env.WEBSOCKET_INTERNAL_SECRET = "s".repeat(32);
    const originalFetch = (global as unknown as { fetch: unknown }).fetch;
    const fetchMock = jest.fn(async () => ({ ok: true })) as jest.Mock;
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    try {
      BY_TABLE.set(users, [{ id: "rider-user-1" }]);
      BY_TABLE.set(rides, [{ id: RIDE_ID, user_id: "rider-user-1", driver_id: "driver-1" }]);
      BY_TABLE.set(drivers, [{ id: "driver-1", user_id: "driver-user-1" }]);

      const res = await POST(chatRequest());
      expect(res.status).toBe(201);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain("/internal/chat/send");
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({
        ride_id: RIDE_ID,
        recipient_user_id: "driver-user-1", // NOT "driver-1"
      });
    } finally {
      (global as unknown as { fetch: unknown }).fetch = originalFetch;
      delete process.env.WEBSOCKET_INTERNAL_SECRET;
    }
  });

  test("a non-participant gets 403 and no message is persisted", async () => {
    BY_TABLE.set(users, [{ id: "attacker-1" }]);
    BY_TABLE.set(rides, [{ id: RIDE_ID, user_id: "rider-user-1", driver_id: "driver-1" }]);
    BY_TABLE.set(drivers, [{ id: "driver-1", user_id: "driver-user-1" }]);

    const res = await POST(chatRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "not_ride_participant" });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
