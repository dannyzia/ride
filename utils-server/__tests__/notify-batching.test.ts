// @ts-nocheck — Jest mock factories produce untyped DB/module chains; runtime
// behavior is what's under test.
/**
 * Predicate tests for lib/notify dedup batching — A8 residual round
 * (`.kilo/plans/round-notify-batching.md` §1 "Test expectations").
 *
 * Disclosed impl-lane test file per the phase0 precedent (logged in the
 * active-lanes.md intent post). Batch semantics under test:
 *   - batch of N keys → ONE dedup SELECT, one multi-row INSERT, chunked expo POSTs
 *   - keys already sent are dropped before INSERT/push
 *   - duplicate keys WITHIN one batch are deduped before the SELECT
 *   - an expo ticket error on one push → logged, remaining pushes still sent, no throw
 *   - single-recipient sendNotification still works (wrapper path)
 *
 * The db mock routes rows off the captured drizzle `inArray` arguments (same
 * assertion style as the sweepDeadlines batch2 tests — assertions are pointed
 * at the executed SQL arguments, not mocked shadows).
 */
jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    inArray: jest.fn((col: unknown, vals: unknown) => actual.inArray(col, vals)),
  };
});

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/src/db", () => {
  const schema = require("../../src/db/schema");
  const state = {
    /** Keys that already exist in notifications (the dedup SELECT's answer). */
    sentKeys: [] as string[],
    devices: [] as Array<{ user_id: string; push_token: string; last_active_at?: Date }>,
    /** Table names passed to from(), in call order. */
    selectFromCalls: [] as string[],
    /** Every row passed to insert().values(), in call order (multi-row = many entries). */
    insertValues: [] as any[],
    /** Count of insert() calls (one per statement). */
    insertCalls: 0,
    /** Tokens captured from delete().where() inArray args (dead-token prune). */
    prunedTokens: [] as string[],
  };

  const db: any = {
    __state: state,
    select: () => ({
      from: (table: any) => {
        state.selectFromCalls.push(
          table === schema.notifications ? "notifications"
          : table === schema.userDevices ? "user_devices"
          : "unknown",
        );
        return {
          where: (_predicate: unknown) => {
            const resolveRows = () => {
              const { inArray } = require("drizzle-orm") as any;
              const calls = (inArray as jest.Mock).mock.calls;
              const last = calls[calls.length - 1] ?? [];
              const colName = last[0]?.name ?? "";
              const values: unknown[] = last[1] ?? [];
              if (colName === "idempotency_key") {
                return state.sentKeys
                  .filter((k) => values.includes(k))
                  .map((k) => ({ idempotency_key: k }));
              }
              if (colName === "user_id") {
                return state.devices.filter((d) => values.includes(d.user_id));
              }
              return [];
            };
            const chain: any = {
              orderBy: () => chain,
              then: (res: any, rej: any) => Promise.resolve(resolveRows()).then(res, rej),
            };
            return chain;
          },
        };
      },
    }),
    insert: () => ({
      values: (vals: unknown) => {
        const rows = Array.isArray(vals) ? vals : [vals];
        state.insertValues.push(...rows);
        state.insertCalls += 1;
        return {
          onConflictDoNothing: async () => [],
          returning: async () => rows.map((r, i) => ({ id: `row-${i}`, ...r })),
        };
      },
    }),
    delete: () => ({
      where: (_predicate: unknown) => {
        const { inArray } = require("drizzle-orm") as any;
        const calls = (inArray as jest.Mock).mock.calls;
        const last = calls[calls.length - 1] ?? [];
        if (last[0]?.name === "push_token") {
          state.prunedTokens.push(...(last[1] ?? []));
        }
        return Promise.resolve();
      },
    }),
  };
  return { db };
});

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

const expoResponse = (perMessage: Array<Record<string, unknown>>) => ({
  json: async () => ({ data: perMessage }),
});

const {
  inArray,
} = require("drizzle-orm");
const { sendNotification, sendNotifications } = require("../../lib/notify");
const { logger } = require("../../lib/logger");
const db = require("@/src/db").db;

const idempotencySelects = () =>
  (inArray as jest.Mock).mock.calls.filter((c) => c[0]?.name === "idempotency_key");
const devices = (userId: string, tokens: string[]) =>
  tokens.map((push_token) => ({ user_id: userId, push_token }));

beforeEach(() => {
  const s = db.__state;
  s.sentKeys = [];
  s.devices = [];
  s.selectFromCalls = [];
  s.insertValues = [];
  s.insertCalls = 0;
  s.prunedTokens = [];
  (inArray as jest.Mock).mockClear();
  fetchMock.mockReset();
  (logger.info as jest.Mock).mockClear();
  (logger.warn as jest.Mock).mockClear();
  (logger.error as jest.Mock).mockClear();
  (logger.debug as jest.Mock).mockClear();
});

describe("sendNotifications — batch dedup semantics", () => {
  it("batch of 5 keys, 2 already sent → 3 pushes, ONE dedup SELECT with 5 keys, ONE multi-row INSERT with 3 keys", async () => {
    db.__state.sentKeys = ["k2", "k4"];
    for (let i = 1; i <= 5; i++) {
      db.__state.devices.push(...devices(`u${i}`, [`token-${i}`]));
    }
    fetchMock.mockResolvedValue(
      expoResponse([
        { status: "ok" },
        { status: "ok" },
        { status: "ok" },
      ]),
    );

    const batch = [1, 2, 3, 4, 5].map((i) => ({
      userId: `u${i}`,
      type: "rental_bid_request",
      title: "T",
      body: "B",
      idempotencyKey: `k${i}`,
    }));
    await expect(sendNotifications(batch)).resolves.toBeUndefined();

    // ONE dedup SELECT carrying the whole batch's keys.
    const sel = idempotencySelects();
    expect(sel).toHaveLength(1);
    expect([...sel[0][1]].sort()).toEqual(["k1", "k2", "k3", "k4", "k5"]);

    // ONE multi-row INSERT recording only the not-yet-sent keys.
    expect(db.__state.insertCalls).toBe(1);
    const insertedKeys = db.__state.insertValues.map((r) => r.idempotency_key).sort();
    expect(insertedKeys).toEqual(["k1", "k3", "k5"]);

    // Exactly one expo POST carrying only the 3 surviving recipients' pushes.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.body).toHaveLength(3);
    expect(body.body.map((m: any) => m.to).sort()).toEqual([
      "token-1",
      "token-3",
      "token-5",
    ]);
  });

  it("duplicate keys WITHIN one batch are deduped before the SELECT", async () => {
    for (const u of ["u1", "u2", "u3", "u4"]) {
      db.__state.devices.push(...devices(u, [`token-${u}`]));
    }
    fetchMock.mockResolvedValue(
      expoResponse([{ status: "ok" }, { status: "ok" }]),
    );

    // r2/r4 repeat r1's key — first occurrence wins, repeats never reach the
    // SELECT, the INSERT, or the push pipeline.
    const batch = [
      { userId: "u1", type: "t", title: "T", body: "B", idempotencyKey: "k1" },
      { userId: "u2", type: "t", title: "T", body: "B", idempotencyKey: "k1" },
      { userId: "u3", type: "t", title: "T", body: "B", idempotencyKey: "k2" },
      { userId: "u4", type: "t", title: "T", body: "B", idempotencyKey: "k1" },
    ];
    await expect(sendNotifications(batch)).resolves.toBeUndefined();

    const sel = idempotencySelects();
    expect(sel).toHaveLength(1);
    expect([...sel[0][1]].sort()).toEqual(["k1", "k2"]);

    expect(db.__state.insertCalls).toBe(1);
    expect(db.__state.insertValues.map((r) => r.idempotency_key).sort()).toEqual(["k1", "k2"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.body.map((m: any) => m.to).sort()).toEqual(["token-u1", "token-u3"]);
  });

  it("expo ticket error on one push → logged, remaining pushes still sent, does not throw", async () => {
    for (const u of ["u1", "u2", "u3"]) {
      db.__state.devices.push(...devices(u, [`token-${u}`]));
    }
    // One chunk POST, three tickets — the middle one is a ticket error.
    fetchMock.mockResolvedValue(
      expoResponse([
        { status: "ok" },
        { status: "error", message: "DeviceNotRegistered" },
        { status: "ok" },
      ]),
    );

    const batch = ["u1", "u2", "u3"].map((u) => ({
      userId: u,
      type: "t",
      title: "T",
      body: "B",
      idempotencyKey: `k-${u}`,
    }));
    await expect(sendNotifications(batch)).resolves.toBeUndefined();

    // All three messages left in the single POST — the error did not abort.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.body).toHaveLength(3);

    // Y-2: the unregistered token is pruned; no error-level log for a
    // handled ticket error.
    expect(db.__state.prunedTokens).toEqual(["token-u2"]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("pushes are chunked 100-per-POST and sent through the concurrency window", async () => {
    for (let i = 1; i <= 250; i++) {
      db.__state.devices.push(...devices(`u${i}`, [`token-${i}`]));
    }
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      return expoResponse(body.body.map(() => ({ status: "ok" })));
    });

    const batch = Array.from({ length: 250 }, (_, i) => ({
      userId: `u${i + 1}`,
      type: "t",
      title: "T",
      body: "B",
      idempotencyKey: `k${i + 1}`,
    }));
    await expect(sendNotifications(batch)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    const sizes = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).body.length);
    expect(sizes).toEqual([100, 100, 50]);
    const totalInserted = db.__state.insertValues.length;
    expect(totalInserted).toBe(250);
  });
});

describe("sendNotification — single-recipient wrapper path", () => {
  it("still works: legacy (non-idempotent) path sends push and writes the audit row", async () => {
    db.__state.devices.push(...devices("u1", ["token-1"]));
    fetchMock.mockResolvedValue(expoResponse([{ status: "ok" }]));

    const result = await sendNotification("u1", "ride:matched", "Title", "Body");
    expect(result).toEqual({ sent: 1, failed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.body).toHaveLength(1);
    expect(body.body[0].to).toBe("token-1");
    expect(body.body[0].priority).toBe("high"); // legacy default
    expect(body.body[0].data).toEqual({});

    // Legacy audit row after push, no idempotency_key.
    expect(db.__state.insertCalls).toBe(1);
    expect(db.__state.insertValues[0].user_id).toBe("u1");
    expect(db.__state.insertValues[0].idempotency_key).toBeUndefined();
  });

  it("still dedups: already-sent key → no push, no insert", async () => {
    db.__state.sentKeys = ["ride:1:reminder_60"];
    db.__state.devices.push(...devices("u1", ["token-1"]));

    const result = await sendNotification("u1", "reminder", "T", "B", {}, {
      idempotencyKey: "ride:1:reminder_60",
    });
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.__state.insertCalls).toBe(0);
  });

  it("still dedups via the gate: fresh key → one push, gate row inserted first", async () => {
    db.__state.devices.push(...devices("u1", ["token-1"]));
    fetchMock.mockResolvedValue(expoResponse([{ status: "ok" }]));

    const result = await sendNotification("u1", "reminder", "T", "B", {}, {
      idempotencyKey: "ride:2:reminder_60",
    });
    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const gateRows = db.__state.insertValues.filter((r) => r.idempotency_key);
    expect(gateRows).toHaveLength(1);
    expect(gateRows[0].idempotency_key).toBe("ride:2:reminder_60");
  });
});
