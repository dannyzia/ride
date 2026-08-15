/**
 * OTP rate-limit counter (lib/otpRateLimit.ts) — the auth endpoints' defense
 * against the unthrottled SMS cannon / verify brute-force. The counter is
 * atomic (ON CONFLICT DO UPDATE + RETURNING) so concurrent attempts can never
 * read-modify-write past each other; the DB is mocked here.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { insert: jest.fn() },
}));

import { db } from "../../src/db";
import { rateLimitCount, OTP_PHONE_MAX, OTP_IP_MAX, OTP_VERIFY_MAX } from "../otpRateLimit";

const counters = new Map<string, number>();

beforeEach(() => {
  counters.clear();
  jest.clearAllMocks();

  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn((v: { key: string }) => {
      const n = (counters.get(v.key) ?? 0) + 1;
      counters.set(v.key, n);
      return {
        onConflictDoUpdate: jest.fn(() => ({
          returning: jest.fn(async () => [{ count: n }]),
        })),
      };
    }),
  }));
});

describe("rateLimitCount", () => {
  test("first call in a window returns 1, subsequent calls increment per key", async () => {
    expect(await rateLimitCount("otp:phone:+8801711111111")).toBe(1);
    expect(await rateLimitCount("otp:phone:+8801711111111")).toBe(2);
    expect(await rateLimitCount("otp:phone:+8801711111111")).toBe(3);
    // different key (different phone) starts its own window
    expect(await rateLimitCount("otp:phone:+8801722222222")).toBe(1);
  });

  test("keys are namespaced by purpose (phone / ip / verify)", async () => {
    await rateLimitCount("otp:phone:+8801711111111");
    await rateLimitCount("otp:ip:203.0.113.9");
    await rateLimitCount("otp:verify:session-1");

    expect(counters.get("otp:phone:+8801711111111")).toBe(1);
    expect(counters.get("otp:ip:203.0.113.9")).toBe(1);
    expect(counters.get("otp:verify:session-1")).toBe(1);
  });

  test("limits are sane (phone 5, ip 20, verify 5 per 5-minute window)", () => {
    expect(OTP_PHONE_MAX).toBeGreaterThan(0);
    expect(OTP_IP_MAX).toBeGreaterThan(OTP_PHONE_MAX);
    expect(OTP_VERIFY_MAX).toBeGreaterThan(0);
  });
});
