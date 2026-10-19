/**
 * A2-1: POST /api/fleet/webhook is a dormant post-launch stub.
 *
 * Every request — provider or not, signed or not — receives the same 410
 * refusal. The route must not parse, validate, deduplicate, or dispatch
 * webhook payloads.
 */
/* eslint-disable import/first */
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { POST } from "@/app/api/fleet/webhook+api";

async function getJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/fleet/webhook (deferred)", () => {
  test("a provider-signed payload receives the deferred refusal", async () => {
    const res = await POST(
      new Request("http://localhost/api/fleet/webhook?provider=uber", {
        method: "POST",
        headers: { "X-Hub-Signature-256": "signed-payload" },
        body: JSON.stringify({ type: "trip.completed", id: "trip-123" }),
      }),
    );
    expect(res.status).toBe(410);
    expect(await getJson(res)).toEqual({
      error: "fleet_integrations_deferred",
      message: "Fleet integrations are deferred until after launch",
    });
  });

  test("the refusal does not depend on provider, signature, or body", async () => {
    const res = await POST(new Request("http://localhost/api/fleet/webhook", { method: "POST" }));
    expect(res.status).toBe(410);
    expect((await getJson(res)).error).toBe("fleet_integrations_deferred");
  });
});
