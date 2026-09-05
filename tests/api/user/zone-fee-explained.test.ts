/**
 * P1-23 (gap ledger): POST /api/user/zone-fee-explained — bodyless POST
 * (AGENTS.md rule) flipping the one-time explainer flag on first dismiss.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { users } from "@/src/db/schema";
import { POST } from "@/app/api/user/zone-fee-explained+api";

type Row = Record<string, unknown>;

function request(): Request {
  return { json: undefined } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supabase-uid" });
});

describe("POST /api/user/zone-fee-explained", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(request());
    expect(res.status).toBe(401);
  });

  test("flips the flag scoped to the caller's auth_uid", async () => {
    const updates: { table: unknown; set: Row }[] = [];
    (db.update as jest.Mock).mockImplementation((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn(async () => {
          updates.push({ table, set: setObj });
          return [];
        }),
      })),
    }));

    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(users);
    expect(updates[0].set).toEqual({ zone_fee_explained: true });
  });

  test("500 on db failure", async () => {
    (db.update as jest.Mock).mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await POST(request());
    expect(res.status).toBe(500);
  });
});
