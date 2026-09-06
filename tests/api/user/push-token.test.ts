/**
 * Push token registration — the canonical endpoint is POST /api/user/device
 * (app/api/user/device+api.ts; the client registers on startup from
 * app/_layout.tsx). Covers the task's "push-token upsert + dedupe" intent:
 *  - unauthenticated → 401, unknown user → 404
 *  - valid {push_token, platform, device_id} upserts user_devices
 *  - the upsert targets the (user_id, device_id) unique index, so a
 *    re-registration for the SAME device updates the token (dedupe) instead
 *    of inserting a duplicate row
 *  - malformed body → 400 validation_error
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { POST } from "@/app/api/user/device+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

function request(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url: "http://localhost/api/user/device",
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

let upserts: { values: Row; conflictTarget: unknown; set: Row }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  upserts = [];
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (db.select as jest.Mock).mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.from = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.limit = jest.fn(async () => [{ id: USER_ID }]);
    return chain;
  });
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn((v: Row) => ({
      // Drizzle API: .onConflictDoUpdate({ target, set }) — one argument.
      onConflictDoUpdate: jest.fn(async (arg: { target: unknown; set: Row }) => {
        upserts.push({ values: v, conflictTarget: arg.target, set: arg.set });
        return undefined;
      }),
    })),
  }));
});

describe("POST /api/user/device (push token registration)", () => {
  test("401 when the token check fails", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(request({ push_token: "ExpoPushToken[abc]", platform: "android", device_id: "dev-1" }));
    expect(res.status).toBe(401);
  });

  test("404 when the caller has no users row", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.from = jest.fn(() => chain);
      chain.where = jest.fn(() => chain);
      chain.limit = jest.fn(async () => []);
      return chain;
    });
    const res = await POST(request({ push_token: "ExpoPushToken[abc]", platform: "android", device_id: "dev-1" }));
    expect(res.status).toBe(404);
  });

  test("400 on a malformed body (missing platform)", async () => {
    const res = await POST(request({ push_token: "ExpoPushToken[abc]", device_id: "dev-1" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
    expect(upserts).toHaveLength(0);
  });

  test("upserts the token keyed by (user_id, device_id)", async () => {
    const res = await POST(
      request({ push_token: "ExpoPushToken[abc]", platform: "android", device_id: "dev-1" }),
    );
    expect(res.status).toBe(200);
    expect(await getJson(res)).toMatchObject({ success: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].values).toMatchObject({
      user_id: USER_ID,
      push_token: "ExpoPushToken[abc]",
      platform: "android",
      device_id: "dev-1",
    });

    // The conflict target is the (user_id, device_id) unique index — same
    // device re-registers → token update, never a duplicate row.
    const targetCols = upserts[0].conflictTarget as unknown as { name: string }[];
    const colNames = targetCols.map((c) => c.name);
    expect(colNames).toEqual(expect.arrayContaining(["user_id", "device_id"]));
  });

  test("same-device re-registration refreshes the token (dedupe semantics)", async () => {
    await POST(request({ push_token: "ExpoPushToken[old]", platform: "ios", device_id: "dev-1" }));
    await POST(request({ push_token: "ExpoPushToken[new]", platform: "ios", device_id: "dev-1" }));
    expect(upserts).toHaveLength(2);
    // Both writes carry the same device key; the second SET swaps the token.
    expect(upserts[1].set.push_token).toBe("ExpoPushToken[new]");
    expect(upserts[1].values.device_id).toBe(upserts[0].values.device_id);
  });
});
