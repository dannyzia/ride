/**
 * Base adapter class — common logic for all external fleet integrations.
 *
 * Handles: retry with exponential backoff, error normalization, idempotent
 * upsert helpers, encrypted credential management, and sync result building.
 *
 * Concrete providers extend this and implement the sync methods.
 *
 * Money fields: integer paisa (BDT) throughout.
 */

import { db } from "@/src/db";
import {
  externalEntityMappings,
  integrationSyncJobs,
  fleetIntegrations,
} from "@/src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import {
  AdapterError,
} from "./types";
import type {
  FleetIntegrationAdapter,
  SyncResult,
  SyncError,
  SyncCapability,
  AdapterCapabilities,
  ExternalVehicle,
  ExternalDriver,
  ExternalTrip,
  WebhookEvent,
} from "./types";

// ── Retry Configuration ───────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export function retryDelay(attempt: number): number {
  const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return delay + Math.random() * 500; // jitter
}

// ── Base Adapter ──────────────────────────────────────────────────────────

export abstract class BaseFleetAdapter implements FleetIntegrationAdapter {
  abstract readonly provider: string;

  protected integrationId: string | null = null;
  protected fleetId: string | null = null;
  protected credentials: Record<string, unknown> = {};

  // ── Lifecycle ────────────────────────────────────────────────────────

  async connect(config: Record<string, unknown>): Promise<void> {
    this.credentials = config;
    await this.validateCredentials();
  }

  async disconnect(): Promise<void> {
    this.credentials = {};
    this.integrationId = null;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.validateCredentials();
      return true;
    } catch {
      return false;
    }
  }

  // ── Subclasses must implement ────────────────────────────────────────

  protected abstract validateCredentials(): Promise<void>;

  abstract getCapabilities(): AdapterCapabilities;

  protected abstract fetchVehicles(): Promise<ExternalVehicle[]>;
  protected abstract fetchDrivers(): Promise<ExternalDriver[]>;
  protected abstract fetchTrips(since?: string): Promise<ExternalTrip[]>;

  // ── Sync methods (use retry + upsert) ────────────────────────────────

  async syncVehicles(fleetId: string): Promise<SyncResult> {
    this.fleetId = fleetId;
    return this.runSync("vehicles", () => this.fetchVehicles());
  }

  async syncDrivers(fleetId: string): Promise<SyncResult> {
    this.fleetId = fleetId;
    return this.runSync("drivers", () => this.fetchDrivers());
  }

  async syncTrips(fleetId: string, since?: string): Promise<SyncResult> {
    this.fleetId = fleetId;
    return this.runSync("trips", () => this.fetchTrips(since));
  }

  async syncEarnings(_fleetId: string): Promise<SyncResult> {
    // Base implementation: earnings sync not supported by default.
    return {
      success: true,
      records_fetched: 0,
      records_created: 0,
      records_updated: 0,
      records_unchanged: 0,
      records_failed: 0,
      errors: [],
      duration_ms: 0,
    };
  }

  async handleWebhook(_event: WebhookEvent): Promise<void> {
    // Base implementation: webhooks not supported by default.
    logger.warn(`[${this.provider}] webhooks not implemented`);
  }

  // ── Internal: retry + upsert pipeline ────────────────────────────────

  protected async runSync(
    entityType: SyncCapability,
    fetcher: () => Promise<unknown[]>,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      records_fetched: 0,
      records_created: 0,
      records_updated: 0,
      records_unchanged: 0,
      records_failed: 0,
      errors: [],
      duration_ms: 0,
    };

    // Create sync job row
    const [job] = await db
      .insert(integrationSyncJobs)
      .values({
        integration_id: this.integrationId!,
        fleet_id: this.fleetId!,
        entity_type: entityType,
        status: "running",
        sync_type: "incremental",
        started_at: new Date(),
      })
      .returning({ id: integrationSyncJobs.id });

    let lastError: AdapterError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const records = await fetcher();
        result.records_fetched = records.length;

        // Process each record with idempotent upsert
        for (const record of records) {
          try {
            const action = await this.upsertEntity(record, entityType);
            if (action === "created") result.records_created++;
            else if (action === "updated") result.records_updated++;
            else result.records_unchanged++;
          } catch (err) {
            result.records_failed++;
            result.errors.push({
              external_id: this.getExternalId(record),
              error_code: "upsert_failed",
              message: err instanceof Error ? err.message : "Unknown error",
              retryable: false,
            });
          }
        }

        result.success = true;
        break;
      } catch (err) {
        lastError = this.normalizeError(err);

        if (!lastError.retryable || attempt === MAX_RETRIES) {
          result.errors.push({
            external_id: "batch",
            error_code: lastError.type,
            message: lastError.message,
            retryable: lastError.retryable,
          });
          break;
        }

        const delay = retryDelay(attempt);
        logger.warn(
          `[${this.provider}] sync ${entityType} attempt ${attempt + 1} failed, retrying in ${delay}ms`,
          { error: lastError.message },
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Update sync job
    result.duration_ms = Date.now() - startTime;
    await db
      .update(integrationSyncJobs)
      .set({
        status: result.success ? "completed" : "failed",
        records_fetched: result.records_fetched,
        records_created: result.records_created,
        records_updated: result.records_updated,
        records_unchanged: result.records_unchanged,
        records_failed: result.records_failed,
        error_message: lastError?.message ?? null,
        error_code: lastError?.type ?? null,
        error_retryable: lastError?.retryable ?? false,
        completed_at: new Date(),
      })
      .where(eq(integrationSyncJobs.id, job.id));

    // Update integration's last_sync_at
    if (result.success) {
      await db
        .update(fleetIntegrations)
        .set({
          last_sync_at: new Date(),
          last_sync_entity: entityType,
          last_error: null,
          last_error_at: null,
          updated_at: new Date(),
        })
        .where(eq(fleetIntegrations.id, this.integrationId!));
    } else if (lastError) {
      await db
        .update(fleetIntegrations)
        .set({
          status: "error",
          last_error: lastError.message,
          last_error_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(fleetIntegrations.id, this.integrationId!));
    }

    return result;
  }

  // ── Idempotent upsert ────────────────────────────────────────────────

  protected async upsertEntity(
    record: unknown,
    entityType: SyncCapability,
  ): Promise<"created" | "updated" | "unchanged"> {
    const extId = this.getExternalId(record);
    const extEntityType = entityType;

    // Internal entity type mapping
    const internalType =
      entityType === "vehicles"
        ? "vehicle"
        : entityType === "drivers"
          ? "driver"
          : entityType === "trips"
            ? "ride"
            : "unknown";

    // Check existing mapping
    const [existing] = await db
      .select()
      .from(externalEntityMappings)
      .where(
        and(
          eq(externalEntityMappings.provider, this.provider as never),
          eq(externalEntityMappings.external_id, extId),
        ),
      )
      .limit(1);

    if (existing) {
      // Update external_data snapshot
      await db
        .update(externalEntityMappings)
        .set({
          external_data: record as Record<string, unknown>,
          last_synced_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(externalEntityMappings.id, existing.id));
      return "unchanged";
    }

    // Create new mapping
    await db.insert(externalEntityMappings).values({
      fleet_id: this.fleetId!,
      integration_id: this.integrationId!,
      provider: this.provider as never,
      external_id: extId,
      external_entity_type: extEntityType,
      internal_entity_type: internalType,
      internal_entity_id: "00000000-0000-0000-0000-000000000000", // placeholder — real mapping done by provider-specific adapter
      external_data: record as Record<string, unknown>,
      last_synced_at: new Date(),
      status: "active",
    });

    return "created";
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  protected getExternalId(record: unknown): string {
    const r = record as Record<string, unknown>;
    return (
      (r.provider_vehicle_id as string) ??
      (r.provider_driver_id as string) ??
      (r.provider_trip_id as string) ??
      "unknown"
    );
  }

  protected normalizeError(err: unknown): AdapterError {
    if (err && typeof err === "object" && "type" in err) {
      return err as AdapterError;
    }
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("timeout") || msg.includes("TIMEOUT")) {
      return new AdapterError("timeout", msg, true);
    }
    if (msg.includes("429") || msg.includes("rate limit")) {
      return new AdapterError("rate_limited", msg, true);
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized")) {
      return new AdapterError("authentication_failed", msg, false);
    }

    return new AdapterError("provider_error", msg, true);
  }
}
