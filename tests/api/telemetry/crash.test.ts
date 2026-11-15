// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime
// behavior is what's under test (house pattern).
/**
 * POST /api/telemetry/crash — first-party crash ingest (Option B).
 *
 * - 201s a valid unauthenticated report (userId null).
 * - Attaches users.id when a Bearer token resolves.
 * - 400s invalid payloads (missing platform / error_message).
 * - 429s after 30 reports/minute from the same IP.
 */
import { jest } from "@jest/globals";

let mockInsertedVals: Record<string, unknown>[] = [];

jest.mock("@/src/db", () => ({
  db: {
    insert: jest.fn((_table: unknown) => ({
      values: jest.fn((vals: Record<string, unknown>) => {
        mockInsertedVals.push(vals);
        return {
          returning: jest.fn(async () => [{ id: "crash-id-1" }]),
        };
      }),
    })),
  },
}));

const mockGetUser = jest.fn(async () => ({
  data: { user: null },
  error: new Error("no token"),
}));
const mockMaybeSingle = jest.fn(async () => ({ data: null }));

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle: (...a: unknown[]) => mockMaybeSingle(...a) })),
      })),
    })),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

/* eslint-disable import/first */
import { POST, resetCrashRateLimit } from "@/app/api/telemetry/crash+api";
import { db } from "@/src/db";

const validBody = () => ({
  platform: "android",
  app_version: "1.0.0",
  error_message: "TypeError: undefined is not a function",
  stack_trace: "at foo (app.js:1:1)",
  is_fatal: true,
  device_id: "dev-1",
});

const makeRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/telemetry/crash", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mockInsertedVals = [];
  resetCrashRateLimit();
  mockGetUser.mockReset().mockResolvedValue({ data: { user: null }, error: new Error("no token") });
  mockMaybeSingle.mockReset().mockResolvedValue({ data: null });
  (db.insert as jest.Mock).mockClear();
});

describe("POST /api/telemetry/crash", () => {
  it("201s a valid unauthenticated report with userId null", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.id).toBe("crash-id-1");
    expect(mockInsertedVals).toHaveLength(1);
    expect(mockInsertedVals[0]).toMatchObject({
      userId: null,
      platform: "android",
      appVersion: "1.0.0",
      isFatal: true,
    });
  });

  it("400s when platform is missing", async () => {
    const { platform: _omit, ...noPlatform } = validBody();
    const res = await POST(makeRequest(noPlatform));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_error");
    expect(mockInsertedVals).toHaveLength(0);
  });

  it("400s when error_message is missing", async () => {
    const { error_message: _omit, ...noMsg } = validBody();
    const res = await POST(makeRequest(noMsg));
    expect(res.status).toBe(400);
    expect(mockInsertedVals).toHaveLength(0);
  });

  it("attaches users.id when a Bearer token resolves", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "auth-1" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "user-uuid-1" } });
    const res = await POST(makeRequest(validBody(), { Authorization: "Bearer tok" }));
    expect(res.status).toBe(201);
    expect(mockInsertedVals[0]).toMatchObject({ userId: "user-uuid-1" });
  });

  it("degrades to userId null when the token does not resolve", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("bad") });
    const res = await POST(makeRequest(validBody(), { Authorization: "Bearer bad" }));
    expect(res.status).toBe(201);
    expect(mockInsertedVals[0]).toMatchObject({ userId: null });
  });

  it("429s after 30 reports/minute from the same IP", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeRequest(validBody()));
      expect(res.status).toBe(201);
    }
    const limited = await POST(makeRequest(validBody()));
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe("rate_limited");
  });
});
