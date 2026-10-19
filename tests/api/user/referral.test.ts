/**
 * C3-2 (STAGE C3-FIX, ruled): GET /api/user/referral is a dormant
 * post-launch stub (house convention: fleet/webhook-deferred.test.ts).
 *
 * Every request — authenticated or not — receives the same 410 refusal.
 * The route must not read a token, touch a table, or write anything.
 */
/* eslint-disable import/first */
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { GET } from "@/app/api/user/referral+api";

async function getJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/user/referral (dormant)", () => {
  test("an authenticated dashboard request receives the dormant refusal", async () => {
    const res = await GET(
      new Request("http://localhost/api/user/referral", {
        headers: { authorization: "Bearer test-token" },
      }),
    );
    expect(res.status).toBe(410);
    expect(await getJson(res)).toEqual({
      error: "referrals_dormant",
      message: "Referrals are coming soon",
    });
  });

  test("the refusal does not depend on auth or headers", async () => {
    const res = await GET(new Request("http://localhost/api/user/referral"));
    expect(res.status).toBe(410);
    expect((await getJson(res)).error).toBe("referrals_dormant");
  });
});
