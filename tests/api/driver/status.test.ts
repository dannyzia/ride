/**
 * M-4: driver/status+api.ts must manage driver_online_sessions:
 * - insert session when going online
 * - update went_offline_at when going offline
 * - return 409 if already online
 */
import { db } from "@/src/db";
import { driverOnlineSessions } from "@/src/db/schema";

import { POST } from "@/app/api/driver/status+api";

jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(() => Promise.resolve({ id: "user-1" })),
}));

jest.mock("@/lib/h3", () => ({
  getH3Cell: jest.fn(() => "test-cell"),
}));

const _mockDb = db as jest.Mocked<typeof db>;

const RESPONSES: any[] = [];

function createSelectChain(rows: any[]) {
  const chain: any = {
    from: jest.fn(() => chain),
    where: jest.fn(() => chain),
    limit: jest.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

describe("driver/status M-4 driver_online_sessions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RESPONSES.length = 0;
  });

  function queueSelectResponses(...rows: any[]) {
    RESPONSES.push(...rows.map(r => createSelectChain(r)));
  }

  it("should insert driver_online_sessions when going online with no existing session", async () => {
    queueSelectResponses(
      [{ id: "user-1" }],           // user lookup
      [{ id: "driver-1", status: "active" }],  // driver lookup
      [],                            // no existing session check
      [{ id: "sub-1" }],            // active subscription lookup
    );

    const insertChain: any = { values: jest.fn(() => Promise.resolve([])) };
    (db.insert as jest.Mock).mockReturnValue(insertChain);

    const updateChain: any = { set: jest.fn(() => ({ where: jest.fn(() => Promise.resolve({ rowsAffected: 1 })) })) };
    (db.update as jest.Mock).mockReturnValue(updateChain);

    (db.select as jest.Mock).mockImplementation(() => RESPONSES.shift() || createSelectChain([]));

    const request = new Request("http://localhost/api/driver/status", {
      method: "POST",
      body: JSON.stringify({ is_online: true, lat: 23.8, lng: 90.4 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(db.insert).toHaveBeenCalledWith(driverOnlineSessions);
  });

  it("should resume zombie session instead of returning 409", async () => {
    queueSelectResponses(
      [{ id: "user-1" }],
      [{ id: "driver-1", status: "active" }],
      [{ id: "session-1" }],       // existing active session (zombie)
      [{ id: "sub-1" }],            // active subscription
    );

    const updateChain: any = { set: jest.fn(() => ({ where: jest.fn(() => Promise.resolve({ rowsAffected: 1 })) })) };
    (db.update as jest.Mock).mockReturnValue(updateChain);

    (db.select as jest.Mock).mockImplementation(() => RESPONSES.shift() || createSelectChain([]));

    const request = new Request("http://localhost/api/driver/status", {
      method: "POST",
      body: JSON.stringify({ is_online: true, lat: 23.8, lng: 90.4 }),
    });

    const response = await POST(request);
    const data = await response.json();

    // Zombie session is resumed, not rejected
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.resumed).toBe(true);
    expect(data.session_id).toBe("session-1");
  });

  it("should update went_offline_at when going offline", async () => {
    queueSelectResponses(
      [{ id: "user-1" }],
      [{ id: "driver-1", status: "active" }],
      [],                            // no existing session for offline path
    );

    const updateChain: any = { set: jest.fn(() => ({ where: jest.fn(() => Promise.resolve({ rowsAffected: 1 })) })) };
    (db.update as jest.Mock).mockReturnValue(updateChain);

    (db.select as jest.Mock).mockImplementation(() => RESPONSES.shift() || createSelectChain([]));

    const request = new Request("http://localhost/api/driver/status", {
      method: "POST",
      body: JSON.stringify({ is_online: false }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });
});
