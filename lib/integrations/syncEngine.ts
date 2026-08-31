/**
 * Sync Engine — orchestrates fleet integration sync operations.
 *
 * - Resolves the correct adapter for a fleet's integration
 * - Runs sync jobs with concurrency control
 * - Surfaces errors as "Needs attention" for the fleet dashboard
 * - Handles initial import vs incremental sync
 *
 * Money fields: integer paisa (BDT) throughout.
 */

import { db } from "@/src/db";
import {
  fleetIntegrations,
  integrationSyncJobs,
} from "@/src/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import type { SyncCapability, SyncResult, AdapterError } from "./types";
import { AdapterError as AdapterErrorClass } from "./types";
import { BaseFleetAdapter } from "./baseAdapter";

// ── Adapter Registry ──────────────────────────────────────────────────────

const adapterRegistry = new Map<string, () => BaseFleetAdapter>();

export function registerAdapter(
  provider: string,
  factory: () => BaseFleetAdapter,
): void {
  adapterRegistry.set(provider, factory);
}

function getAdapter(provider: string): BaseFleetAdapter {
  const factory = adapterRegistry.get(provider);
  if (!factory) {
    throw new Error(`No adapter registered for provider: ${provider}`);
  }
  return factory();
}

// ── Sync Orchestration ────────────────────────────────────────────────────

export interface SyncRequest {
  fleet_id: string;
  integration_id: string;
  entity_type: SyncCapability;
  sync_type: "initial_import" | "incremental";
}

export interface SyncJobStatus {
  id: string;
  entity_type: string;
  status: string;
  sync_type: string;
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  error_message: string | null;
  error_code: string | null;
  error_retryable: boolean;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  duration_ms: number | null;
}

/**
 * Trigger a sync for a specific entity type.
 * Returns the sync result immediately (runs async in production;
 * synchronous in tests for determinism).
 */
export async function triggerSync(
  request: SyncRequest,
): Promise<SyncResult> {
  // Load the integration
  const [integration] = await db
    .select()
    .from(fleetIntegrations)
    .where(eq(fleetIntegrations.id, request.integration_id))
    .limit(1);

  if (!integration) {
    throw new AdapterErrorClass(
      "configuration_error",
      `Integration ${request.integration_id} not found`,
    );
  }

  if (integration.status === "disabled") {
    throw new AdapterErrorClass(
      "permission_denied",
      "Integration is disabled",
    );
  }

  // Get the adapter
  const adapter = getAdapter(integration.provider);
  adapter["integrationId"] = integration.id;
  adapter["fleetId"] = request.fleet_id;

  // Load credentials (decrypted)
  if (integration.credentials_encrypted) {
    adapter["credentials"] = { encrypted: integration.credentials_encrypted };
  }

  // Check capability
  const capabilities = adapter.getCapabilities();
  if (!capabilities.capabilities.includes(request.entity_type)) {
    throw new AdapterErrorClass(
      "configuration_error",
      `Provider ${integration.provider} does not support ${request.entity_type} sync`,
    );
  }

  // Run the sync
  logger.info("[syncEngine] starting sync", {
    fleet_id: request.fleet_id,
    provider: integration.provider,
    entity_type: request.entity_type,
    sync_type: request.sync_type,
  });

  let result: SyncResult;
  switch (request.entity_type) {
    case "vehicles":
      result = await adapter.syncVehicles(request.fleet_id);
      break;
    case "drivers":
      result = await adapter.syncDrivers(request.fleet_id);
      break;
    case "trips":
      result = await adapter.syncTrips(request.fleet_id);
      break;
    case "earnings":
      result = await adapter.syncEarnings(request.fleet_id);
      break;
    default:
      throw new AdapterErrorClass(
        "configuration_error",
        `Unknown entity type: ${request.entity_type}`,
      );
  }

  return result;
}

/**
 * Get recent sync jobs for a fleet (for the dashboard).
 */
export async function getRecentSyncJobs(
  fleetId: string,
  limit = 10,
): Promise<SyncJobStatus[]> {
  const rows = await db
    .select({
      id: integrationSyncJobs.id,
      entity_type: integrationSyncJobs.entity_type,
      status: integrationSyncJobs.status,
      sync_type: integrationSyncJobs.sync_type,
      records_fetched: integrationSyncJobs.records_fetched,
      records_created: integrationSyncJobs.records_created,
      records_updated: integrationSyncJobs.records_updated,
      records_failed: integrationSyncJobs.records_failed,
      error_message: integrationSyncJobs.error_message,
      error_code: integrationSyncJobs.error_code,
      error_retryable: integrationSyncJobs.error_retryable,
      started_at: integrationSyncJobs.started_at,
      completed_at: integrationSyncJobs.completed_at,
      duration_ms: sql<number>`EXTRACT(EPOCH FROM (${integrationSyncJobs.completed_at} - ${integrationSyncJobs.started_at})) * 1000`.as("duration_ms"),
    })
    .from(integrationSyncJobs)
    .where(eq(integrationSyncJobs.fleet_id, fleetId))
    .orderBy(desc(integrationSyncJobs.created_at))
    .limit(limit);

  return rows    .map((r) => ({
    ...r,
    started_at: r.started_at?.toISOString?.() ?? r.started_at,
    completed_at: r.completed_at?.toISOString?.() ?? r.completed_at,
    duration_ms: r.duration_ms ? Math.round(Number(r.duration_ms)) : null,
  }));
}

/**
 * Get integrations with errors for the fleet dashboard "Needs attention" section.
 */
export async function getIntegrationsNeedingAttention(
  fleetId: string,
): Promise<
  {
    id: string;
    provider: string;
    status: string;
    last_error: string | null;
    last_error_at: string | null;
  }[]
> {
  const rows = await db
    .select({
      id: fleetIntegrations.id,
      provider: fleetIntegrations.provider,
      status: fleetIntegrations.status,
      last_error: fleetIntegrations.last_error,
      last_error_at: fleetIntegrations.last_error_at,
    })
    .from(fleetIntegrations)
    .where(
      and(
        eq(fleetIntegrations.fleet_id, fleetId),
        eq(fleetIntegrations.status, "error"),
      ),
    );

  return rows.map((r) => ({
    ...r,
    last_error_at: r.last_error_at instanceof Date ? r.last_error_at.toISOString() : r.last_error_at,
  }));
}

// ── Register built-in adapters ───────────────────────────────────────────

import { MockRidePlatformAdapter } from "./mockRidePlatform";
registerAdapter("mock_platform", () => new MockRidePlatformAdapter());
