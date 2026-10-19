/**
 * C2-4 (STAGE C2-FIX): unified delete — one route, DUES-ZERO precondition,
 * PII scrub, `deleted:` tombstone, idempotent re-delete, freed-phone re-register.
 *
 * - second delete succeeds (the 23505 class is dead)
 * - delete with outstanding dues 409s with the amount
 * - freed phone re-registers (register dedupe filters deleted_at — source pin)
 * - fault-injection: checkDeleteDues neutralised to null flips the 409 test
 */
jest.mock("@/lib/auth", () => ({
  resolveToken: jest.fn(async () => ({ id: "sup-1" })),
}));
jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: { auth: { admin: { signOut: jest.fn(async () => undefined) } } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));

import { db } from "@/src/db";
import { DELETE } from "@/app/api/user/account+api";
import { checkDeleteDues, scrubAccountTx, tombstonePhone } from "@/lib/accountDelete";

const USER_ID = "11111111-1111-4111-a111-111111111111";

function jsonRequest(body?: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => "Bearer tok" },
  } as unknown as Request;
}

// Queue-based fake tx: each awaited select consumes the next canned row-set.
function fakeTx(queue: unknown[][]) {
  const sets: Array<{ table: string; set: Record<string, unknown> }> = [];
  let i = 0;
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => queue[i++] ?? [];
    c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(queue[i++] ?? []).then(res, rej);
    return c;
  };
  const tx = {
    select: () => chain(),
    update: (table: { _: unknown } | object) => ({
      set: (s: Record<string, unknown>) => {
        sets.push({ table: String((table as { [k: string]: unknown })?.["_.name"] ?? "t"), set: s });
        return { where: async () => undefined };
      },
    }),
  };
  return { tx, sets };
}

function mockUserRow(row: { id: string; deleted_at: string | null }) {
  (db.select as jest.Mock).mockImplementation(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => [row];
    return c;
  });
}

describe("C2-4 unified delete (DELETE /api/user/account)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("second delete succeeds without touching the ledger", async () => {
    mockUserRow({ id: USER_ID, deleted_at: "2026-10-01T00:00:00.000Z" });
    const res = await DELETE(jsonRequest({ reason: "again" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, already_deleted: true });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("delete with driver commission dues 409s with the outstanding amount", async () => {
    mockUserRow({ id: USER_ID, deleted_at: null });
    const { tx } = fakeTx([[{ id: "d1" }], [{ total: 5000 }]]);
    (db.transaction as jest.Mock).mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    const res = await DELETE(jsonRequest({}));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "dues_outstanding",
      message: "Outstanding dues must be settled before deletion",
      kind: "driver_commission",
      amount_bdt: 5000,
    });
  });

  it("zero dues scrubs PII with tombstone phone + deleted_at", async () => {
    mockUserRow({ id: USER_ID, deleted_at: null });
    const { tx, sets } = fakeTx([[], [{ total: 0 }], [{ total: 0 }], []]);
    (db.transaction as jest.Mock).mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    const res = await DELETE(jsonRequest({ reason: "user_initiated" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // users + rider_addresses + rides scrubbed in one tx.
    expect(sets).toHaveLength(3);
    const userSet = sets[0].set;
    expect(String(userSet.phone)).toMatch(/^deleted:/);
    expect(String(userSet.phone).length).toBeLessThanOrEqual(20);
    expect(userSet.name).toBe("[deleted]");
    expect(userSet.email).toBeNull();
    expect(userSet.deleted_at).toBeInstanceOf(Date);
  });

  it("tombstone is idempotent per row and unique across rows", () => {
    expect(tombstonePhone(USER_ID)).toBe(tombstonePhone(USER_ID));
    expect(tombstonePhone(USER_ID)).toMatch(/^deleted:/);
    expect(tombstonePhone(USER_ID).length).toBeLessThanOrEqual(20);
    expect(tombstonePhone("22222222-2222-4222-a222-222222222222")).not.toBe(tombstonePhone(USER_ID));
  });

  it("checkDeleteDues: clean fixture passes, dues fixture blocks (fault-injection anchor)", async () => {
    const clean = fakeTx([[], [{ total: 0 }], [{ total: 0 }], []]);
    await expect(checkDeleteDues(clean.tx as never, USER_ID)).resolves.toBeNull();
    const dues = fakeTx([[], [{ total: 7500 }], []]);
    await expect(checkDeleteDues(dues.tx as never, USER_ID)).resolves.toEqual({
      kind: "courier_remittance",
      amount_bdt: 7500,
    });
    // A neutralised detector (always-null) would flip the 409 test above —
    // the pin is the 409 assertion, not this unit.
  });

  it("scrub writes the tombstone (writer shape pin)", async () => {
    const { tx, sets } = fakeTx([]);
    const { phone } = await scrubAccountTx(tx as never, USER_ID);
    expect(phone).toBe(tombstonePhone(USER_ID));
    expect(sets).toHaveLength(3);
  });

  it("register phone-dedupe filters deleted rows (freed phone re-registers)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../../app/api/register+api.ts"),
      "utf8",
    );
    expect(src).toContain("isNull(users.deleted_at)");
    expect(src).toContain("phone_exists");
  });
});
