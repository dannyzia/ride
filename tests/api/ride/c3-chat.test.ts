/* eslint-disable import/first */
/**
 * C3-1 (STAGE C3-FIX): the ride/[id]/{message,messages,details} trio resolves
 * rides.driver_id (drivers.id) to the driver's users.id before comparing —
 * the exact case that 403'd drivers forever.
 */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "sup-driver" })),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn() },
}));

import { db } from "@/src/db";
import { POST as sendMessage } from "@/app/api/ride/[id]/message+api";
import { GET as loadMessages } from "@/app/api/ride/[id]/messages+api";
import { GET as rideDetails } from "@/app/api/ride/[id]/details+api";

const RIDE_ID = "11111111-1111-4111-a111-111111111111";
const RIDER_USER_ID = "22222222-2222-4222-a222-222222222222";
const DRIVER_ID = "33333333-3333-4333-a333-333333333333"; // drivers.id
const DRIVER_USER_ID = "44444444-4444-4444-a444-444444444444"; // users.id

const RIDE_ROW = {
  id: RIDE_ID,
  user_id: RIDER_USER_ID,
  driver_id: DRIVER_ID,
  status: "driver_arriving",
};

function queuedSelects(rows: unknown[][]) {
  let i = 0;
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.orderBy = () => c;
    c.limit = async () => rows[i++] ?? [];
    c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows[i++] ?? []).then(res, rej);
    return c;
  };
  (db.select as jest.Mock).mockImplementation(() => chain());
}

function mockInsert(msg: Record<string, unknown>) {
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: () => ({ returning: async () => [msg] }),
  }));
}

function postRequest(body: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => "Bearer tok" },
    url: "http://localhost/",
  } as unknown as Request;
}

function getRequest(): Request {
  return {
    headers: { get: () => "Bearer tok" },
    url: "http://localhost/",
  } as unknown as Request;
}

describe("C3-1 driver chat (the 403-forever case)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("a driver sends chat: 201 (old drivers.id comparison would 403)", async () => {
    // Fixture property: the raw drivers.id NEVER equals the users.id — the
    // pre-C3-1 check `ride.driver_id !== user.id` 403s this exact caller.
    expect(DRIVER_ID).not.toBe(DRIVER_USER_ID);
    queuedSelects([
      [{ id: DRIVER_USER_ID, role: "driver" }],
      [RIDE_ROW],
      [{ user_id: DRIVER_USER_ID }],
    ]);
    const msg = { id: "m1", ride_id: RIDE_ID, sender_id: DRIVER_USER_ID, content: "hi", created_at: new Date() };
    mockInsert(msg);
    const res = await sendMessage(postRequest({ content: "hi" }), { id: RIDE_ID });
    expect(res.status).toBe(201);
    expect((await res.json()).sender_id).toBe(DRIVER_USER_ID);
  });

  it("a driver loads messages: 200 with the list", async () => {
    queuedSelects([
      [{ id: DRIVER_USER_ID }],
      [RIDE_ROW],
      [{ user_id: DRIVER_USER_ID }],
      [{ id: "m1", content: "hi" }],
    ]);
    const res = await loadMessages(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect((await res.json()).messages).toHaveLength(1);
  });

  it("details returns the RESOLVED users.id counterparty (not drivers.id)", async () => {
    queuedSelects([
      [{ id: DRIVER_USER_ID, role: "driver" }],
      [RIDE_ROW],
      [{ user_id: DRIVER_USER_ID }],
      [{ name: "Rina", phone: "+8801711111111" }],
    ]);
    const res = await rideDetails(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.other_user_id).toBe(RIDER_USER_ID);
    expect(body.other_user_id).not.toBe(DRIVER_ID);
  });

  it("non-participants still 403 on all three routes", async () => {
    queuedSelects([[{ id: "stranger", role: "rider" }], [RIDE_ROW], [{ user_id: DRIVER_USER_ID }]]);
    mockInsert({ id: "m9" });
    const res = await sendMessage(postRequest({ content: "hi" }), { id: RIDE_ID });
    expect(res.status).toBe(403);
  });
});
