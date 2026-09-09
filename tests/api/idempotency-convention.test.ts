// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (house pattern: tests/api/package/purchase-gate.test.ts).
/* eslint-disable import/first */
/**
 * ISSUE-37 — platform-wide Idempotency-Key convention
 * (decision 01M23628A1566SK1D5XXV1NT5G).
 *
 * Part A pins lib/idempotency.ts semantics against an in-memory claim store:
 *   - fresh claim → 'execute'; completed winner → replay (original status/body);
 *   - in-flight winner → 409 conflict; 23505 race loser reads and resolves;
 *   - user co-scope: a foreign user's key never replays their outcome.
 *
 * Part B is AC-5 end-to-end through the REAL POST handler of
 * app/api/rider/wallet/topup+api.ts: same key twice → exactly one
 * payment_events row (the mocked initiatePortposPayment stands in for the
 * lib/paymentEvents write owner and records one row per real invocation)
 * and the second response is the replayed original outcome. A different
 * key executes normally; an in-flight key 409s.
 *
 * The @/src/db mock emulates the (route, key) unique barrier: a claim
 * insert for an existing pair throws {code:'23505'} exactly like Postgres,
 * and selects dispatch on the TABLE identity (users vs idempotencyKeys).
 */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "auth-1" })),
}));
jest.mock("@/src/db", () => {
  const state = {
    users: [] as Row[],
    claims: [] as Record<string, unknown>[],
    paymentEvents: [] as Record<string, unknown>[],
    failNextClaimInsert: false,
  };
  const dialect = () => new (require("drizzle-orm/pg-core").PgDialect)();
  const predicateParams = (predicate: unknown): unknown[] =>
    dialect().sqlToQuery(predicate as never).params as unknown[];

  const db: Record<string, unknown> = {
    __state: state,
    select: jest.fn(() => {
      const chain: Record<string, unknown> = {};
      let predicate: unknown;
      const resolve = () => {
        const table = chain.__table;
        if (table === (require("@/src/db/schema") as { idempotencyKeys: unknown }).idempotencyKeys) {
          const [route, key] = predicateParams(predicate) as [string, string];
          return Promise.resolve(state.claims.filter((c) => c.route === route && c.key === key));
        }
        return Promise.resolve(state.users);
      };
      chain.from = (table: unknown) => {
        chain.__table = table;
        return chain;
      };
      chain.where = (p?: unknown) => {
        predicate = p;
        return chain;
      };
      chain.limit = () => chain;
      chain.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        resolve().then(res, rej);
      return chain;
    }),
    insert: jest.fn(() => ({
      values: async (v: Record<string, unknown>) => {
        if (state.failNextClaimInsert) {
          state.failNextClaimInsert = false;
          throw { code: "23505" };
        }
        if (typeof v.route === "string" && typeof v.key === "string") {
          if (state.claims.some((c) => c.route === v.route && c.key === v.key)) {
            throw { code: "23505" }; // unique barrier on (route, key)
          }
          state.claims.push({ ...v });
          return;
        }
        throw new Error("unexpected insert in test: " + JSON.stringify(v).slice(0, 80));
      },
    })),
    update: jest.fn(() => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (predicate: unknown) => {
          const [route, key] = predicateParams(predicate) as [string, string];
          const row = state.claims.find((c) => c.route === route && c.key === key);
          if (row) Object.assign(row, patch);
        },
      }),
    })),
  };
  return { db };
});
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/portpos", () => ({
  isConfigured: jest.fn(() => true),
}));
jest.mock("@/lib/paymentEvents", () => ({
  initiatePortposPayment: jest.fn(async (params: Record<string, unknown>) => {
    const { db } = require("@/src/db");
    const id = `pe-${db.__state.paymentEvents.length + 1}`;
    db.__state.paymentEvents.push({ id, reference: params.idempotency_key });
    return { payment_url: "https://pay.example/invoice", payment_event_id: id };
  }),
}));

import { db } from "@/src/db";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import {
  beginIdempotencyClaim,
  storeIdempotencyOutcome,
  extractIdempotencyKey,
  sha256Fingerprint,
  IDEMPOTENCY_ROUTES,
} from "@/lib/idempotency";
import { POST as riderTopupPOST } from "@/app/api/rider/wallet/topup+api";

type Row = Record<string, unknown>;

const KEY = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const ROUTE = IDEMPOTENCY_ROUTES.riderWalletTopup;
const BODY = { amount_bdt: 50000 };

const dbState = (db as unknown as { __state: {
  users: Row[];
  claims: Record<string, unknown>[];
  paymentEvents: Row[];
  failNextClaimInsert: boolean;
} }).__state;

beforeEach(() => {
  jest.clearAllMocks();
  dbState.users = [[{ id: USER_ID, name: "Rider", email: "r@x.bd", phone: "+8801700000000" }]];
  dbState.claims = [];
  dbState.paymentEvents = [];
  dbState.failNextClaimInsert = false;
});

function topupRequest(key?: string, body: unknown = BODY): Request {
  const headers: Record<string, string> = {
    authorization: "Bearer t",
    "content-type": "application/json",
  };
  if (key) headers["Idempotency-Key"] = key;
  return new Request("http://localhost/api/rider/wallet/topup", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("lib/idempotency — extractIdempotencyKey contract", () => {
  test("absent header → null; trims whitespace; rejects empty and >255 chars", () => {
    expect(extractIdempotencyKey(new Request("http://x", { method: "POST" }))).toBeNull();
    expect(extractIdempotencyKey(topupRequest("  "))).toBeNull();
    expect(extractIdempotencyKey(topupRequest(` ${KEY} `))).toBe(KEY);
    const long = "k".repeat(256);
    expect(extractIdempotencyKey(topupRequest(long))).toBeNull();
  });
});

describe("lib/idempotency — two-phase claim semantics", () => {
  test("fresh claim → execute (in-flight marker with null response_status)", async () => {
    const outcome = await beginIdempotencyClaim({ route: ROUTE, key: KEY, userId: USER_ID });
    expect(outcome.kind).toBe("execute");
    expect(dbState.claims).toHaveLength(1);
    expect(dbState.claims[0]).toMatchObject({ route: ROUTE, key: KEY, user_id: USER_ID, response_status: null });
  });

  test("completed winner → replay returns the ORIGINAL outcome with Idempotency-Replayed", async () => {
    dbState.claims.push({ route: ROUTE, key: KEY, user_id: USER_ID, response_status: 200, response_body: { payment_url: "u", payment_event_id: "pe-9" } });
    const outcome = await beginIdempotencyClaim({ route: ROUTE, key: KEY, userId: USER_ID });
    expect(outcome.kind).toBe("replay");
    if (outcome.kind !== "replay") return;
    expect(outcome.response.status).toBe(200);
    expect(outcome.response.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(json(outcome.response)).resolves.toMatchObject({ payment_event_id: "pe-9" });
  });

  test("in-flight winner → 409 idempotency_key_in_progress", async () => {
    dbState.claims.push({ route: ROUTE, key: KEY, user_id: USER_ID, response_status: null, response_body: null });
    const outcome = await beginIdempotencyClaim({ route: ROUTE, key: KEY, userId: USER_ID });
    expect(outcome.kind).toBe("conflict");
    if (outcome.kind !== "conflict") return;
    expect(outcome.response.status).toBe(409);
    await expect(json(outcome.response)).resolves.toMatchObject({ error: "idempotency_key_in_progress" });
  });

  test("23505 race loser reads the winner row and resolves to replay", async () => {
    dbState.failNextClaimInsert = true;
    dbState.claims.push({ route: ROUTE, key: KEY, user_id: USER_ID, response_status: 200, response_body: { winner: true } });
    const outcome = await beginIdempotencyClaim({ route: ROUTE, key: KEY, userId: USER_ID });
    expect(outcome.kind).toBe("replay");
    if (outcome.kind !== "replay") return;
    await expect(json(outcome.response)).resolves.toMatchObject({ winner: true });
  });

  test("user co-scope: a foreign user's key conflicts instead of replaying their outcome", async () => {
    dbState.claims.push({ route: ROUTE, key: KEY, user_id: "99999999-9999-4999-8999-999999999999", response_status: 200, response_body: { secret: true } });
    const outcome = await beginIdempotencyClaim({ route: ROUTE, key: KEY, userId: USER_ID });
    expect(outcome.kind).toBe("conflict");
  });

  test("storeIdempotencyOutcome persists status+body; the next claim replays them", async () => {
    await beginIdempotencyClaim({ route: ROUTE, key: KEY, userId: USER_ID });
    await storeIdempotencyOutcome({ route: ROUTE, key: KEY }, Response.json({ ok: 1 }, { status: 201 }));
    expect(dbState.claims[0].response_status).toBe(201);
    expect(dbState.claims[0].response_body).toEqual({ ok: 1 });

    const outcome = await beginIdempotencyClaim({ route: ROUTE, key: KEY, userId: USER_ID });
    expect(outcome.kind).toBe("replay");
    if (outcome.kind !== "replay") return;
    expect(outcome.response.status).toBe(201);
  });

  test("sha256Fingerprint is deterministic and body-sensitive", () => {
    expect(sha256Fingerprint("POST", JSON.stringify(BODY))).toBe(sha256Fingerprint("POST", JSON.stringify(BODY)));
    expect(sha256Fingerprint("POST", JSON.stringify(BODY))).not.toBe(sha256Fingerprint("POST", JSON.stringify({ amount_bdt: 99000 })));
  });
});

describe("AC-5 end-to-end — rider wallet topup with the real handler", () => {
  test("same key twice → exactly one payment_events row + replayed original response", async () => {
    const first = await riderTopupPOST(topupRequest(KEY));
    expect(first.status).toBe(200);
    const firstBody = await json(first);
    expect(firstBody.payment_event_id).toBe("pe-1");
    expect(dbState.paymentEvents).toHaveLength(1);
    expect(dbState.claims[0]).toMatchObject({ route: ROUTE, key: KEY, response_status: 200 });

    const second = await riderTopupPOST(topupRequest(KEY));
    expect(second.status).toBe(200);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(json(second)).resolves.toMatchObject({ payment_event_id: "pe-1" });
    // The barrier held: the payment write owner ran exactly once.
    expect(dbState.paymentEvents).toHaveLength(1);
    expect(initiatePortposPayment).toHaveBeenCalledTimes(1);
  });

  test("different key → separate execution (barrier is per (route, key))", async () => {
    await riderTopupPOST(topupRequest(KEY));
    const res = await riderTopupPOST(topupRequest("b0000000-0000-4000-8000-000000000002"));
    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toMatchObject({ payment_event_id: "pe-2" });
    expect(dbState.paymentEvents).toHaveLength(2);
  });

  test("in-flight claim for the key → 409 to the concurrent retry", async () => {
    dbState.claims.push({ route: ROUTE, key: KEY, user_id: USER_ID, response_status: null, response_body: null });
    const res = await riderTopupPOST(topupRequest(KEY));
    expect(res.status).toBe(409);
    await expect(json(res)).resolves.toMatchObject({ error: "idempotency_key_in_progress" });
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("no header → legacy behavior (fresh server key, still exactly one payment row per request)", async () => {
    const res = await riderTopupPOST(topupRequest());
    expect(res.status).toBe(200);
    expect(dbState.paymentEvents).toHaveLength(1);
    expect(dbState.claims).toHaveLength(0);
  });
});
