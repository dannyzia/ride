/**
 * C2-3 (STAGE C2-FIX, F-36 C): sessions over user_devices — list,
 * revoke-single, logout-everywhere.
 */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "sup-1" })),
}));
jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: { auth: { admin: { signOut: jest.fn(async () => undefined) } } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
  },
}));

import { db } from "@/src/db";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { DELETE, GET } from "@/app/api/user/sessions+api";

function getRequest(): Request {
  return { headers: { get: () => "Bearer tok" } } as unknown as Request;
}

function jsonRequest(body: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => "Bearer tok" },
  } as unknown as Request;
}

// db.select queue (GET: caller lookup, device rows; DELETE: caller lookup).
function mockSelects(rows: unknown[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => rows[i++] ?? [];
    c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows[i++] ?? []).then(res, rej);
    return c;
  });
}

describe("C2-3 sessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("GET lists devices with the bound current flag", async () => {
    mockSelects([
      [{ id: "u1", device_id: "dev-a" }],
      [
        { id: "r1", device_id: "dev-a", platform: "android", last_active_at: new Date("2026-10-01T00:00:00Z") },
        { id: "r2", device_id: "dev-b", platform: "web", last_active_at: new Date("2026-10-02T00:00:00Z") },
      ],
    ]);
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0]).toMatchObject({ device_id: "dev-a", current: true });
    expect(body.sessions[1]).toMatchObject({ device_id: "dev-b", current: false });
  });

  it("DELETE {device_id} revokes that row and unbinds when current", async () => {
    mockSelects([[{ id: "u1", device_id: "dev-a" }]]);
    const res = await DELETE(jsonRequest({ device_id: "dev-a" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, revoked: "dev-a" });
    expect(db.delete).toHaveBeenCalled();
    // Bound device revoked → binding cleared.
    expect(db.update).toHaveBeenCalled();
  });

  it("DELETE {all:true} clears every device, unbinds, and signs out", async () => {
    mockSelects([[{ id: "u1", device_id: "dev-a" }]]);
    const res = await DELETE(jsonRequest({ all: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, revoked: "all" });
    expect(db.delete).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
    expect(supabaseAdmin.auth.admin.signOut).toHaveBeenCalledWith("tok");
  });

  it("revoke body requires exactly one of device_id / all", async () => {
    mockSelects([[{ id: "u1", device_id: "dev-a" }]]);
    const res = await DELETE(jsonRequest({}));
    expect(res.status).toBe(400);
  });
});
