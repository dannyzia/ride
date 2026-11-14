// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime
// behavior is what's under test (house pattern: tests/api/auth/register-launch-free.test.ts).
/**
 * POST /api/register — separated consent architecture (§4 + §6).
 *
 * - 400s terms_required without terms_accepted:true (unchanged gate).
 * - Persists marketing_opt_in:true with a marketing_opt_in_at timestamp.
 * - Defaults marketing_opt_in:false (marketing_opt_in_at null) when omitted.
 * - Stamps terms_version v1.0.
 */
import { jest } from "@jest/globals";

let mockSelectQueue: unknown[][] = [];
let mockInserts: { table: unknown; vals: Record<string, unknown> }[] = [];

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: jest.fn(async () => ({
          data: { user: { id: "auth-uid-consent" } },
          error: null,
        })),
        deleteUser: jest.fn(async () => ({ error: null })),
      },
    },
  },
}));

jest.mock("@/lib/verifiedPhones", () => ({
  consumeVerification: jest.fn(() => true),
}));

jest.mock("@/lib/launchFreeSubscription", () => ({
  grantLaunchFreeIfEligible: jest.fn(async () => ({ status: "skipped" })),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/src/db", () => {
  const chain = (rows: unknown[] | null) => {
    const c: any = () => {};
    const finish = () => Promise.resolve(rows === null ? [] : rows);
    const proxy = new Proxy(c, {
      get(target: any, prop) {
        if (prop === Symbol.toPrimitive || prop === "then")
          return (res: any, rej: any) => finish().then(res, rej);
        return target[prop];
      },
    });
    c.from = () => proxy;
    c.where = () => proxy;
    c.limit = () => finish();
    c.then = (res: any, rej: any) => finish().then(res, rej);
    c.returning = () => finish();
    return proxy;
  };
  const txApi = {
    select: jest.fn(() => chain([])),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((vals: Record<string, unknown>) => {
        mockInserts.push({ table, vals });
        return { returning: jest.fn(async () => [{ id: "new-user-id", ...vals }]) };
      }),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
  };
  return {
    db: {
      select: jest.fn(() => {
        const next = mockSelectQueue.shift();
        return chain((next ?? []) as unknown[]);
      }),
      insert: jest.fn((table: unknown) => ({
        values: jest.fn((vals: Record<string, unknown>) => {
          mockInserts.push({ table, vals });
          return { returning: jest.fn(async () => [{ id: "new-user-id", ...vals }]) };
        }),
      })),
      update: txApi.update,
      transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(txApi)),
    },
  };
});

/* eslint-disable import/first */
import { POST as registerRoute } from "@/app/api/register+api";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";

const riderBody = (overrides: Record<string, unknown> = {}) => ({
  phone: "+8801700000101",
  name: "Consent User",
  role: "rider",
  password: "secret123",
  gender: "male",
  terms_accepted: true,
  ...overrides,
});

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mockSelectQueue = [];
  mockInserts = [];
  (db.select as jest.Mock).mockClear();
});

describe("POST /api/register — separated consent (§4 + §6)", () => {
  it("400s terms_required without the mandatory flag", async () => {
    const { terms_accepted: _omit, ...noConsent } = riderBody();
    const res = await registerRoute(makeRequest(noConsent));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("terms_required");
  });

  it("persists marketing_opt_in:true with a timestamp and terms_version", async () => {
    const res = await registerRoute(makeRequest(riderBody({ marketing_opt_in: true })));
    expect(res.status).toBe(201);
    const userInserts = mockInserts.filter((i) => i.table === users);
    expect(userInserts).toHaveLength(1);
    expect(userInserts[0].vals.marketingOptIn).toBe(true);
    expect(userInserts[0].vals.marketingOptInAt).toBeInstanceOf(Date);
    expect(userInserts[0].vals.termsVersion).toBe("v1.0");
    expect(userInserts[0].vals.terms_accepted_at).toBeInstanceOf(Date);
  });

  it("defaults marketing_opt_in:false with null timestamp when omitted", async () => {
    const res = await registerRoute(makeRequest(riderBody()));
    expect(res.status).toBe(201);
    const userInserts = mockInserts.filter((i) => i.table === users);
    expect(userInserts).toHaveLength(1);
    expect(userInserts[0].vals.marketingOptIn).toBe(false);
    expect(userInserts[0].vals.marketingOptInAt).toBeNull();
  });
});
