/* eslint-disable import/first */
/**
 * C3-4 (STAGE C3-FIX): start-PIN attempt counter + ×3 lockout on BOTH entry
 * points (WS ride:start + REST start+api). Locked rides reject even the
 * correct PIN; the 3rd miss locks + notifies the admin (audit trail).
 */
jest.mock("@/lib/auth", () => ({
  requireRole: () => async () => ({ dbUser: { id: "driver-user-1" } }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn() },
}));

import { db } from "@/src/db";
import { POST as startRide } from "@/app/api/ride/[id]/start+api";
import { isPinLocked, recordPinFailure, resetPinAttempts } from "@/lib/ridePinLockout";

const RIDE_ID = "11111111-1111-4111-a111-111111111111";
const DRIVER_ID = "33333333-3333-4333-a333-333333333333";

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

// update().set().where() awaits to undefined; .where().returning() shifts row sets.
function queuedUpdates(returningRows: unknown[][]) {
  let i = 0;
  (db.update as jest.Mock).mockImplementation(() => ({
    set: () => ({
      where: () => ({
        returning: async () => returningRows[i++] ?? [],
        then: (res: (v: unknown) => void) => res(undefined),
      }),
    }),
  }));
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn(async () => undefined),
  }));
}

function postRequest(body: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => "Bearer tok" },
    url: "http://localhost/",
  } as unknown as Request;
}

describe("C3-4 PIN lockout helper", () => {
  beforeEach(() => jest.clearAllMocks());

  it("isPinLocked is true only with a lock timestamp", () => {
    expect(isPinLocked({ start_pin_locked_at: null })).toBe(false);
    expect(isPinLocked({ start_pin_locked_at: new Date() })).toBe(true);
  });

  it("1st/2nd miss increments without locking; 3rd locks + notifies", async () => {
    queuedUpdates([[{ attempts: 1 }]]);
    await expect(recordPinFailure(db, RIDE_ID)).resolves.toEqual({ attempts: 1, locked: false });
    expect(db.insert).not.toHaveBeenCalled();

    queuedUpdates([[{ attempts: 3 }]]);
    await expect(recordPinFailure(db, RIDE_ID)).resolves.toEqual({ attempts: 3, locked: true });
    // F-05 admin notify = audit trail write.
    expect(db.insert).toHaveBeenCalled();
  });

  it("resetPinAttempts zeroes the counter", async () => {
    queuedUpdates([]);
    await resetPinAttempts(db, RIDE_ID);
    expect(db.update).toHaveBeenCalled();
  });
});

describe("C3-4 REST start+api", () => {
  beforeEach(() => jest.clearAllMocks());

  it("3rd wrong PIN locks the ride (403 pin_locked + notify)", async () => {
    queuedSelects([
      [{ id: DRIVER_ID }],
      [{ id: RIDE_ID, driver_id: DRIVER_ID, start_pin: "1234", start_pin_attempts: 2, start_pin_locked_at: null, status: "driver_arrived" }],
    ]);
    queuedUpdates([[{ attempts: 3 }]]);
    const res = await startRide(postRequest({ pin: "0000" }), { id: RIDE_ID });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("pin_locked");
    expect(db.insert).toHaveBeenCalled();
  });

  it("correct PIN after lock still fails", async () => {
    queuedSelects([
      [{ id: DRIVER_ID }],
      [{ id: RIDE_ID, driver_id: DRIVER_ID, start_pin: "1234", start_pin_attempts: 3, start_pin_locked_at: new Date().toISOString(), status: "driver_arrived" }],
    ]);
    queuedUpdates([]);
    const res = await startRide(postRequest({ pin: "1234" }), { id: RIDE_ID });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("pin_locked");
  });

  it("WS ride:start shares the lockout (source pin — boots on import)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(path.join(__dirname, "../../../utils-server/index.ts"), "utf8");
    const startIdx = src.indexOf('action === "start"');
    expect(startIdx).toBeGreaterThan(-1);
    const block = src.slice(startIdx, startIdx + 3000);
    expect(block).toContain("start_pin_locked_at");
    expect(block).toContain("pin_locked");
    expect(block).toContain("recordPinFailure");
    expect(block).toContain("resetPinAttempts");
  });
});
