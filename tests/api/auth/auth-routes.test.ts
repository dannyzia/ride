/**
 * P1-19 (gap ledger): the public auth surface — send-otp / verify-otp /
 * check-user / logout / verify-token. Security invariants:
 *  - DEV-ONLY OTP bypass: when enabled it skips BOTH rate limiting and the
 *    SMS round-trip (no cost, no lockout); when disabled the phone+IP rate
 *    limits gate the SMS cannon (429)
 *  - verify-otp local brute-force cap returns the SAME invalid_otp shape as
 *    a wrong code (lockout indistinguishable from a typo)
 *  - phone normalization always stores a leading + (client format match)
 *  - dpRelay upstream failures surface as 502, everything else as 500
 */
/* eslint-disable import/first */
jest.mock("@/lib/dprelay", () => ({
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
}));
jest.mock("@/lib/devOtpBypass", () => ({
  isDevOtpBypassEnabled: jest.fn(),
  createDevSession: jest.fn(),
  devOtpCode: jest.fn(() => "123456"),
  consumeDevSession: jest.fn(),
}));
jest.mock("@/lib/otpRateLimit", () => ({
  rateLimitCount: jest.fn(async () => 0),
  OTP_PHONE_MAX: 5,
  OTP_IP_MAX: 30,
  OTP_VERIFY_MAX: 10,
}));
jest.mock("@/lib/verifiedPhones", () => ({
  markVerified: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    auth: {
      admin: { signOut: jest.fn() },
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

import { sendOtp as dpSendOtp, verifyOtp as dpVerifyOtp } from "@/lib/dprelay";
import {
  isDevOtpBypassEnabled,
  createDevSession,
  consumeDevSession,
} from "@/lib/devOtpBypass";
import { rateLimitCount } from "@/lib/otpRateLimit";
import { markVerified } from "@/lib/verifiedPhones";
import { db } from "@/src/db";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { POST as sendOtp } from "@/app/api/auth/send-otp+api";
import { POST as verifyOtp } from "@/app/api/auth/verify-otp+api";
import { POST as checkUser } from "@/app/api/auth/check-user+api";
import { POST as logout } from "@/app/api/auth/logout+api";
import { POST as verifyToken } from "@/app/api/auth/verify-token+api";

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown, headers: Record<string, string> = {}): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    headers: { get: (k: string) => headers[k] ?? null },
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps prior implementations — the rate-limit tests set
  // per-key implementations that must not leak into later cases.
  (rateLimitCount as jest.Mock).mockReset().mockResolvedValue(0);
  (isDevOtpBypassEnabled as jest.Mock).mockReturnValue(false);
  (dpSendOtp as jest.Mock).mockResolvedValue({ sessionId: "sess-1", expiresAt: "2026-09-05T10:05:00Z" });
  (dpVerifyOtp as jest.Mock).mockResolvedValue({ verified: true, phoneNumber: "01712345678" });
});

describe("POST /api/auth/send-otp", () => {
  test("400 validation_error for a non-+880 phone", async () => {
    const res = await sendOtp(jsonRequest({ phone: "01712345678" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("dev bypass: session returned WITHOUT touching rate limits or SMS", async () => {
    (isDevOtpBypassEnabled as jest.Mock).mockReturnValue(true);
    (createDevSession as jest.Mock).mockReturnValue({ sessionId: "dev-sess", expiresAt: "soon" });

    const res = await sendOtp(jsonRequest({ phone: "+8801712345678" }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.dev).toBe(true);
    expect(body.devOtp).toBe("123456");
    expect(createDevSession).toHaveBeenCalledWith("+8801712345678");
    expect(rateLimitCount).not.toHaveBeenCalled();
    expect(dpSendOtp).not.toHaveBeenCalled();
  });

  test("429 rate_limited when the phone exceeds its cap", async () => {
    (rateLimitCount as jest.Mock).mockImplementation(async (key: string) =>
      key.startsWith("otp:phone:") ? 6 : 0,
    );
    const res = await sendOtp(jsonRequest({ phone: "+8801712345678" }));
    expect(res.status).toBe(429);
    expect((await getJson(res)).error).toBe("rate_limited");
    expect(dpSendOtp).not.toHaveBeenCalled();
  });

  test("429 rate_limited when the IP exceeds its cap", async () => {
    (rateLimitCount as jest.Mock).mockImplementation(async (key: string) =>
      key.startsWith("otp:ip:") ? 31 : 0,
    );
    const res = await sendOtp(jsonRequest({ phone: "+8801712345678" }, { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }));
    expect(res.status).toBe(429);
  });

  test("success: dpRelay session id and expiry returned", async () => {
    const res = await sendOtp(jsonRequest({ phone: "+8801712345678" }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ sessionId: "sess-1", expiresAt: "2026-09-05T10:05:00Z" });
    expect(dpSendOtp).toHaveBeenCalledWith("+8801712345678");
  });

  test("502 otp_send_failed when dpRelay errors", async () => {
    (dpSendOtp as jest.Mock).mockRejectedValue(new Error("dpRelay unreachable"));
    const res = await sendOtp(jsonRequest({ phone: "+8801712345678" }));
    expect(res.status).toBe(502);
    expect((await getJson(res)).error).toBe("otp_send_failed");
  });

  test("500 server_error for unexpected failures", async () => {
    (dpSendOtp as jest.Mock).mockRejectedValue(new Error("panic"));
    const res = await sendOtp(jsonRequest({ phone: "+8801712345678" }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/auth/verify-otp", () => {
  test("400 validation_error for a 5-digit otp", async () => {
    const res = await verifyOtp(jsonRequest({ sessionId: "sess-1", otp: "12345" }));
    expect(res.status).toBe(400);
  });

  test("dev bypass: invalid/expired dev session → 400 invalid_otp", async () => {
    (isDevOtpBypassEnabled as jest.Mock).mockReturnValue(true);
    (consumeDevSession as jest.Mock).mockReturnValue(null);
    const res = await verifyOtp(jsonRequest({ sessionId: "dev-sess", otp: "123456" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_otp");
  });

  test("dev bypass: valid code marks phone verified (normalized to +)", async () => {
    (isDevOtpBypassEnabled as jest.Mock).mockReturnValue(true);
    (consumeDevSession as jest.Mock).mockReturnValue("01712345678");

    const res = await verifyOtp(jsonRequest({ sessionId: "dev-sess", otp: "123456" }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.verified).toBe(true);
    expect(body.phoneNumber).toBe("+01712345678");
    expect(markVerified).toHaveBeenCalledWith("+01712345678");
  });

  test("brute-force cap past OTP_VERIFY_MAX → same invalid_otp shape (lockout indistinguishable)", async () => {
    (rateLimitCount as jest.Mock).mockResolvedValue(11);
    const res = await verifyOtp(jsonRequest({ sessionId: "sess-1", otp: "123456" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_otp");
    expect(dpVerifyOtp).not.toHaveBeenCalled();
  });

  test("wrong code → 400 invalid_otp", async () => {
    (dpVerifyOtp as jest.Mock).mockResolvedValue({ verified: false, phoneNumber: "" });
    const res = await verifyOtp(jsonRequest({ sessionId: "sess-1", otp: "000000" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_otp");
    expect(markVerified).not.toHaveBeenCalled();
  });

  test("success: verified phone normalized with leading + and marked", async () => {
    const res = await verifyOtp(jsonRequest({ sessionId: "sess-1", otp: "123456" }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.verified).toBe(true);
    expect(body.phoneNumber).toBe("+01712345678");
    expect(markVerified).toHaveBeenCalledWith("+01712345678");
  });

  test("502 otp_verify_failed on dpRelay error", async () => {
    (dpVerifyOtp as jest.Mock).mockRejectedValue(new Error("dpRelay down"));
    const res = await verifyOtp(jsonRequest({ sessionId: "sess-1", otp: "123456" }));
    expect(res.status).toBe(502);
  });
});

describe("POST /api/auth/check-user", () => {
  test("400 validation_error for a malformed phone", async () => {
    const res = await checkUser(jsonRequest({ phone: "12345" }));
    expect(res.status).toBe(400);
  });

  test("exists=false for an unknown phone", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => [],
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([]).then(res, rej),
      };
      return chain;
    });
    const res = await checkUser(jsonRequest({ phone: "+8801712345678" }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ exists: false, role: null });
  });

  test("exists=true with the user's role", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      const rows = [{ id: "u-1", role: "driver" }];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => rows,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    });
    const res = await checkUser(jsonRequest({ phone: "+8801712345678" }));
    expect(await getJson(res)).toEqual({ exists: true, role: "driver" });
  });
});

describe("POST /api/auth/logout", () => {
  test("401 missing_token without an Authorization header", async () => {
    const res = await logout(jsonRequest());
    expect(res.status).toBe(401);
    expect((await getJson(res)).error).toBe("missing_token");
  });

  test("500 logout_failed when supabase signOut errors", async () => {
    (supabaseAdmin.auth.admin.signOut as jest.Mock).mockResolvedValue({ error: { message: "revoked?" } });
    const res = await logout(jsonRequest(undefined, { Authorization: "Bearer tok" }));
    expect(res.status).toBe(500);
    expect((await getJson(res)).error).toBe("logout_failed");
  });

  test("200 ok on successful sign-out", async () => {
    (supabaseAdmin.auth.admin.signOut as jest.Mock).mockResolvedValue({ error: null });
    const res = await logout(jsonRequest(undefined, { Authorization: "Bearer tok" }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true });
  });
});

describe("POST /api/auth/verify-token", () => {
  function mockFrom(singleResults: { data: Row | null }[]): void {
    let call = 0;
    (supabaseAdmin.from as jest.Mock).mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => singleResults[call++] ?? { data: null },
        }),
      }),
    }));
  }

  test("401 missing_token", async () => {
    const res = await verifyToken(jsonRequest());
    expect(res.status).toBe(401);
  });

  test("401 invalid_token when supabase rejects", async () => {
    (supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { message: "expired" },
    });
    const res = await verifyToken(jsonRequest(undefined, { Authorization: "Bearer bad" }));
    expect(res.status).toBe(401);
    expect((await getJson(res)).error).toBe("invalid_token");
  });

  test("exists=true with the users row", async () => {
    (supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "supabase-uid" } },
      error: null,
    });
    mockFrom([{ data: { id: "u-1", role: "rider", phone: "+8801712345678", name: "Zia" } }]);

    const res = await verifyToken(jsonRequest(undefined, { Authorization: "Bearer good" }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({
      exists: true,
      user_id: "u-1",
      role: "rider",
      phone: "+8801712345678",
      name: "Zia",
    });
  });

  test("registration race: users row commits late → retry succeeds", async () => {
    (supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "supabase-uid" } },
      error: null,
    });
    mockFrom([
      { data: null },
      { data: { id: "u-late", role: "rider", phone: "+8801712345678", name: "Late" } },
    ]);

    const res = await verifyToken(jsonRequest(undefined, { Authorization: "Bearer good" }));
    expect(res.status).toBe(200);
    expect((await getJson(res)).exists).toBe(true);
  }, 10_000);

  test("registration race lost: row never commits → exists=false", async () => {
    (supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "supabase-uid" } },
      error: null,
    });
    mockFrom([{ data: null }, { data: null }]);

    const res = await verifyToken(jsonRequest(undefined, { Authorization: "Bearer good" }));
    expect((await getJson(res)).exists).toBe(false);
  }, 10_000);
});
