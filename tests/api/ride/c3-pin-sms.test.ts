/* eslint-disable import/first */
/**
 * C3-3 (STAGE C3-FIX): at match, the PIN goes to the PASSENGER's phone —
 * the secondary contact on book-for-other rides, the rider otherwise.
 */
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));

import { db } from "@/src/db";
import { sendMatchPinSms } from "@/lib/ridePinSms";

function queuedSelects(rows: unknown[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => rows[i++] ?? [];
    return c;
  });
}

describe("C3-3 match PIN SMS", () => {
  beforeEach(() => jest.clearAllMocks());

  it("book-for-other: PIN goes to the secondary contact, not the booker", async () => {
    queuedSelects([
      [{ user_id: "booker", secondary_rider_phone: "+8801799999999", is_booked_for_someone_else: true }],
    ]);
    const send = jest.fn(async (_to: string, _message: string): Promise<void> => undefined);
    const res = await sendMatchPinSms(db, { ride_id: "r1", start_pin: "4821" }, send);
    expect(res).toEqual({ to: "+8801799999999", sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("+8801799999999");
    expect(send.mock.calls[0][1]).toContain("4821");
  });

  it("normal ride: PIN goes to the rider's own phone", async () => {
    queuedSelects([
      [{ user_id: "rider", secondary_rider_phone: null, is_booked_for_someone_else: false }],
      [{ phone: "+8801711111111" }],
    ]);
    const send = jest.fn(async () => undefined);
    const res = await sendMatchPinSms(db, { ride_id: "r1", start_pin: "4821" }, send);
    expect(res).toEqual({ to: "+8801711111111", sent: true });
  });

  it("SMS failure is non-blocking (match already committed)", async () => {
    queuedSelects([
      [{ user_id: "rider", secondary_rider_phone: null, is_booked_for_someone_else: false }],
      [{ phone: "+8801711111111" }],
    ]);
    const send = jest.fn(async () => {
      throw new Error("dpRelay down");
    });
    const res = await sendMatchPinSms(db, { ride_id: "r1", start_pin: "4821" }, send);
    expect(res).toEqual({ to: "+8801711111111", sent: false });
  });
});
