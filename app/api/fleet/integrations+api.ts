/**
 * Fleet Integration Management API.
 *
 * GET    /api/fleet/integrations?fleet_id=...          — List integrations
 * POST   /api/fleet/integrations?fleet_id=...          — Connect new provider
 * PATCH  /api/fleet/integrations?fleet_id=...          — Update config / re-enable
 * DELETE /api/fleet/integrations?id=...&fleet_id=...   — Disconnect provider
 * POST   /api/fleet/integrations/sync?fleet_id=...     — Trigger sync
 *
 * All routes gated to fleet OWNER via requireFleetMember.
 * Money fields: integer paisa (BDT).
 */

import { db } from "@/src/db";
import { fleetIntegrations, integrationSyncJobs } from "@/src/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";
import { triggerSync, getRecentSyncJobs } from "@/lib/integrations/syncEngine";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

const connectSchema = z.object({
  provider: z.enum(["uber", "indrive", "pathao", "obaih", "inDrive", "custom", "mock_platform"]),
  credentials: z.record(z.unknown()),
  config: z.record(z.unknown()).optional(),
  webhook_url: z.string().url().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["connected", "disabled"]).optional(),
  config: z.record(z.unknown()).optional(),
  webhook_url: z.string().url().nullable().optional(),
});

const syncSchema = z.object({
  integration_id: z.string().uuid(),
  entity_type: z.enum(["vehicles", "drivers", "trips", "earnings"]),
  sync_type: z.enum(["initial_import", "incremental"]).default("incremental"),
});

// ── GET — list integrations ───────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsed.data.fleet_id;

    await requireFleetMember(fleetId)(request);

    const rows = await db
      .select({
        id: fleetIntegrations.id,
        provider: fleetIntegrations.provider,
        status: fleetIntegrations.status,
        capabilities: fleetIntegrations.capabilities,
        last_sync_at: fleetIntegrations.last_sync_at,
        last_sync_entity: fleetIntegrations.last_sync_entity,
        last_error: fleetIntegrations.last_error,
        last_error_at: fleetIntegrations.last_error_at,
        webhook_url: fleetIntegrations.webhook_url,
        created_at: fleetIntegrations.created_at,
      })
      .from(fleetIntegrations)
      .where(eq(fleetIntegrations.fleet_id, fleetId))
      .orderBy(desc(fleetIntegrations.created_at));

    // Get recent sync jobs per integration
    const integrationIds = rows.map((r) => r.id);
    let recentJobs: { integration_id: string; status: string; entity_type: string; created_at: Date }[] = [];
    if (integrationIds.length > 0) {
      recentJobs = await db
        .select({
          integration_id: integrationSyncJobs.integration_id,
          status: integrationSyncJobs.status,
          entity_type: integrationSyncJobs.entity_type,
          created_at: integrationSyncJobs.created_at,
        })
        .from(integrationSyncJobs)
        .where(
          and(
            eq(integrationSyncJobs.fleet_id, fleetId),
            eq(integrationSyncJobs.sync_type, "webhook" as never),
          ),
        )
        .orderBy(desc(integrationSyncJobs.created_at))
        .limit(20) as typeof recentJobs;
    }

    return Response.json({ integrations: rows, recent_jobs: recentJobs }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403) return Response.json({ error: "forbidden", message: "Only the fleet owner can manage integrations" }, { status: 403 });
    logger.error("[fleet/integrations] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

// ── POST — connect provider ───────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const parsedFleet = querySchema.safeParse({ fleet_id: url.searchParams.get("fleet_id") });
    if (!parsedFleet.success) {
      return Response.json({ error: "invalid_param", message: "Valid fleet_id required" }, { status: 400 });
    }
    const fleetId = parsedFleet.data.fleet_id;

    await requireFleetMember(fleetId, ["OWNER"])(request);

    const body = await parseJsonBody(request, connectSchema);
    if (!body.ok) return body.response;

    const { provider, credentials, config, webhook_url } = body.data;

    // Check for existing connection
    const [existing] = await db
      .select({ id: fleetIntegrations.id })
      .from(fleetIntegrations)
      .where(and(eq(fleetIntegrations.fleet_id, fleetId), eq(fleetIntegrations.provider, provider)))
      .limit(1);

    if (existing) {
      return Response.json({ error: "already_connected", message: `Provider ${provider} is already connected. Use PATCH to update.` }, { status: 409 });
    }

    // Get capabilities from adapter
    const capabilities = await getAdapterCapabilities(provider);

    // In production, credentials would be encrypted before storage
    const [integration] = await db
      .insert(fleetIntegrations)
      .values({
        fleet_id: fleetId,
        provider,
        status: "pending",
        credentials_encrypted: JSON.stringify(credentials), // TODO: encrypt
        config: config ?? {},
        capabilities,
        webhook_url: webhook_url ?? null,
      })
      .returning({ id: fleetIntegrations.id });

    logger.info("[fleet/integrations] connected", { fleet_id: fleetId, provider, integration_id: integration.id });

    return Response.json({ integration_id: integration.id, provider, status: "pending" }, { status: 201 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403) return Response.json({ error: "forbidden", message: "Only the fleet owner can manage integrations" }, { status: 403 });
    logger.error("[fleet/integrations] POST error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

// ── PATCH — update / enable / disable ─────────────────────────────────────

export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url);
    const parsedFleet = querySchema.safeParse({ fleet_id: url.searchParams.get("fleet_id") });
    if (!parsedFleet.success) {
      return Response.json({ error: "invalid_param", message: "Valid fleet_id required" }, { status: 400 });
    }
    const fleetId = parsedFleet.data.fleet_id;

    await requireFleetMember(fleetId, ["OWNER"])(request);

    const body = await parseJsonBody(request, updateSchema);
    if (!body.ok) return body.response;

    const { id, ...updates } = body.data;
    const setFields: Record<string, unknown> = { updated_at: new Date() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) setFields[key] = value;
    }

    const [updated] = await db
      .update(fleetIntegrations)
      .set(setFields)
      .where(and(eq(fleetIntegrations.id, id), eq(fleetIntegrations.fleet_id, fleetId)))
      .returning({ id: fleetIntegrations.id });

    if (!updated) {
      return Response.json({ error: "not_found", message: "Integration not found" }, { status: 404 });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403) return Response.json({ error: "forbidden", message: "Only the fleet owner can manage integrations" }, { status: 403 });
    logger.error("[fleet/integrations] PATCH error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

// ── DELETE — disconnect provider ──────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const parsedFleet = querySchema.safeParse({ fleet_id: url.searchParams.get("fleet_id") });
    if (!parsedFleet.success) {
      return Response.json({ error: "invalid_param", message: "Valid fleet_id required" }, { status: 400 });
    }
    const fleetId = parsedFleet.data.fleet_id;

    await requireFleetMember(fleetId, ["OWNER"])(request);

    const integrationId = url.searchParams.get("id");
    if (!integrationId) {
      return Response.json({ error: "invalid_param", message: "Integration id required" }, { status: 400 });
    }

    const [updated] = await db
      .update(fleetIntegrations)
      .set({ status: "disabled", updated_at: new Date() })
      .where(and(eq(fleetIntegrations.id, integrationId), eq(fleetIntegrations.fleet_id, fleetId)))
      .returning({ id: fleetIntegrations.id });

    if (!updated) {
      return Response.json({ error: "not_found", message: "Integration not found" }, { status: 404 });
    }

    logger.info("[fleet/integrations] disconnected", { fleet_id: fleetId, integration_id: integrationId });
    return Response.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403) return Response.json({ error: "forbidden", message: "Only the fleet owner can manage integrations" }, { status: 403 });
    logger.error("[fleet/integrations] DELETE error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function getAdapterCapabilities(provider: string) {
  // Default capabilities for each provider
  const defaults: Record<string, { capabilities: string[]; supports_webhooks: boolean; supports_incremental: boolean; max_batch_size: number; rate_limit_per_minute: number }> = {
    uber: { capabilities: ["vehicles", "drivers", "trips", "earnings"], supports_webhooks: true, supports_incremental: true, max_batch_size: 100, rate_limit_per_minute: 60 },
    indrive: { capabilities: ["vehicles", "drivers", "trips"], supports_webhooks: false, supports_incremental: true, max_batch_size: 50, rate_limit_per_minute: 30 },
    pathao: { capabilities: ["vehicles", "drivers", "trips"], supports_webhooks: true, supports_incremental: true, max_batch_size: 50, rate_limit_per_minute: 30 },
    obaih: { capabilities: ["vehicles", "drivers", "trips"], supports_webhooks: false, supports_incremental: false, max_batch_size: 25, rate_limit_per_minute: 20 },
    inDrive: { capabilities: ["vehicles", "drivers", "trips"], supports_webhooks: false, supports_incremental: true, max_batch_size: 50, rate_limit_per_minute: 30 },
    custom: { capabilities: ["vehicles", "drivers", "trips", "earnings"], supports_webhooks: false, supports_incremental: false, max_batch_size: 100, rate_limit_per_minute: 60 },
    mock_platform: { capabilities: ["vehicles", "drivers", "trips", "earnings"], supports_webhooks: false, supports_incremental: true, max_batch_size: 100, rate_limit_per_minute: 1000 },
  };

  return defaults[provider] ?? defaults.custom;
}
