/**
 * C2-2 (STAGE C2-FIX, F-36 B): OTP-to-NEW-number → atomic users.phone update.
 * Roles untouched by construction (only the phone column is written);
 * verify-token/check-user keep resolving by auth_uid; old phone freed.
 */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "sup-1" })),
}));
jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: { auth: { admin: { updateUserById: jest.fn(async () => ({ error: null })) } } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
  },
}));

import { db } from "@/src/db";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { markVerified } from "@/lib/verifiedPhones";
import { POST } from "@/app/api/user/change-phone+api";

const OLD_PHONE = "+8801711111111";
const NEW_PHONE = "+8801722222222";

function jsonRequest(body: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => "Bearer tok" },
  } as unknown as Request;
}

// db.select queue: [caller lookup, taken check]
function mockSelects(rows: unknown[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => rows[i++] ?? [];
    return c;
  });
}

describe("C2-2 change-phone", () => {
  beforeEach(() => jest.clearAllMocks());

  it("verified new phone swaps atomically; roles untouched (phone-only write)", async () => {
    markVerified(NEW_PHONE);
    mockSelects([[{ id: "u1", phone: OLD_PHONE, auth_uid: "sup-1" }], []]);
    const res = await POST(jsonRequest({ new_phone: NEW_PHONE }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, phone: NEW_PHONE });
    expect(supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith("sup-1", { phone: NEW_PHONE });
    // The only column written is phone (+ updated_at) — roles survive by
    // construction (internal User ID model).
    const setArg = (db.update as jest.Mock).mock.results[0].value.set.mock.calls[0][0];
    expect(Object.keys(setArg).sort()).toEqual(["phone", "updated_at"]);
  });

  it("unverified new phone 403s without consuming anything", async () => {
    mockSelects([[{ id: "u1", phone: OLD_PHONE, auth_uid: "sup-1" }], []]);
    const res = await POST(jsonRequest({ new_phone: "+8801733333333" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("phone_not_verified");
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("taken new phone 409s (live rows only)", async () => {
    markVerified(NEW_PHONE);
    mockSelects([[{ id: "u1", phone: OLD_PHONE, auth_uid: "sup-1" }], [{ id: "u2" }]]);
    const res = await POST(jsonRequest({ new_phone: NEW_PHONE }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("phone_exists");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("same phone is a no-op success", async () => {
    mockSelects([[{ id: "u1", phone: OLD_PHONE, auth_uid: "sup-1" }]]);
    const res = await POST(jsonRequest({ new_phone: OLD_PHONE }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, unchanged: true, phone: OLD_PHONE });
  });
});
