/**
 * POST /api/fleet/webhook?provider=uber
 *
 * Public endpoint that receives webhook callbacks from external providers.
 * Validates signature, prevents replay, dispatches to the adapter.
 *
 * No JWT required — providers authenticate via webhook signature.
 */

import { handleWebhook } from "@/lib/integrations/webhookHandler";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");

    if (!provider) {
      return Response.json(
        { error: "invalid_param", message: "Provider query param required" },
        { status: 400 },
      );
    }

    // Read raw body for signature validation
    const rawBody = await request.text();

    // Extract signature from headers (provider-specific)
    const signature =
      request.headers.get("X-Hub-Signature-256") ??
      request.headers.get("X-Signature") ??
      request.headers.get("X-Webhook-Signature") ??
      null;

    const result = await handleWebhook(provider, rawBody, signature);

    logger.info("[fleet/webhook] processed", {
      provider,
      status: result.status,
      message: result.message,
    });

    return Response.json(
      { message: result.message },
      { status: result.status },
    );
  } catch (err) {
    logger.error("[fleet/webhook] error", err);
    return Response.json(
      { error: "internal_error", message: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
