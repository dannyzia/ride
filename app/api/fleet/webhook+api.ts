// [public]
/**
 * POST /api/fleet/webhook — DORMANT STUB (plan 27 §15 D-viii).
 *
 * Fleet integrations are deferred until after launch. This route intentionally
 * accepts no provider, reads no request body, validates no signature, and
 * writes nothing: every call receives the same 410 refusal. The webhook
 * draft in lib/integrations/webhookHandler.ts is NOT wired here.
 */
import { logger } from "@/lib/logger";

export async function POST(_request?: Request) {
  logger.warn("[fleet/webhook] deferred integration webhook received");
  return Response.json(
    {
      error: "fleet_integrations_deferred",
      message: "Fleet integrations are deferred until after launch",
    },
    { status: 410 },
  );
}
