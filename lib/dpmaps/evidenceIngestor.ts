/**
 * lib/dpmaps/evidenceIngestor.ts — Telemetry and continuous learning ingestion
 * for dpMaps.
 *
 * Ingests ground-truth evidence when a trip completes:
 * - Location truth: Driver handset physical end-of-trip drop-off GPS fix.
 * - Name truth: Rider typed destination query, strictly scrubbed of PII.
 * - Clean-room invariant: Never logs or stores vendor IDs, vendor coordinates,
 *   or core order/trip UUIDs into the evidence ledger. All user identifiers
 *   are pseudonoymized via keyed HMAC-SHA256.
 */

import { createHmac } from 'crypto';
import { getH3CellRes10 } from '@/lib/h3';
import { scrubPii } from './piiScrubber';
import { getConfigValue } from '@/lib/platformConfig';
import { db } from '@/src/db';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const INGESTION_SALT = process.env.DPMAPS_INGESTION_SALT || 'ride-dpmaps-cleanroom-2026';

export interface CompletedTripTelemetry {
  rider_user_id: string;
  driver_user_id: string;
  typed_query: string;
  driver_dropoff_gps: {
    lat: number;
    lng: number;
  };
  completed_at?: Date;
}

export interface IngestionResult {
  accepted: boolean;
  reason?: string;
  trip_hash?: string;
  h3_res10?: string;
  normalized_query?: string;
}

export async function ingestCompletedTrip(
  telemetry: CompletedTripTelemetry,
): Promise<IngestionResult> {
  const enabled = (await getConfigValue('dpmaps_learning_ingest_enabled', 'true')) === 'true';
  if (!enabled) {
    return { accepted: false, reason: 'INGESTION_DISABLED' };
  }

  // 1. Scrub all PII from typed query
  const cleanQuery = scrubPii(telemetry.typed_query);
  if (!cleanQuery || cleanQuery.length < 2) {
    return { accepted: false, reason: 'QUERY_TOO_SHORT_OR_EMPTY_AFTER_SCRUB' };
  }

  // 2. Validate driver handset GPS coordinates
  const { lat, lng } = telemetry.driver_dropoff_gps;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { accepted: false, reason: 'INVALID_COORDINATES' };
  }
  // Coarse bounding check for Bangladesh (approx lat: 20-27, lng: 88-93)
  if (lat < 20 || lat > 27 || lng < 88 || lng > 93) {
    return { accepted: false, reason: 'COORDINATES_OUTSIDE_REGION' };
  }

  // 3. Compute H3 resolution 10 index cell
  let h3Res10 = '';
  try {
    h3Res10 = getH3CellRes10(lat, lng);
  } catch {
    return { accepted: false, reason: 'H3_INDEXING_FAILED' };
  }

  // 4. Generate pseudonym hashes (Clean Room Hard Rule 8)
  const completedAt = telemetry.completed_at ?? new Date();
  const tripHash = createHmac('sha256', INGESTION_SALT)
    .update(`${telemetry.rider_user_id}:${completedAt.getTime()}`)
    .digest('hex');
  const riderPseudonym = createHmac('sha256', INGESTION_SALT)
    .update(telemetry.rider_user_id)
    .digest('hex');
  const driverPseudonym = createHmac('sha256', INGESTION_SALT)
    .update(telemetry.driver_user_id)
    .digest('hex');

  const normalizedQuery = cleanQuery.toLowerCase().slice(0, 80);
  const queryClusterId = createHmac('sha256', INGESTION_SALT)
    .update(normalizedQuery)
    .digest('hex')
    .slice(0, 32);

  // 5. Insert into dpmaps.trip_evidence_ledger if table exists
  try {
    await db.execute(sql`
      INSERT INTO dpmaps.trip_evidence_ledger (
        query_cluster_id,
        normalized_query,
        typed_len,
        vote_class,
        h3_res10,
        dropoff_geom,
        initial_weight,
        point_type,
        trip_hash,
        created_at
      ) VALUES (
        ${queryClusterId},
        ${normalizedQuery},
        ${Math.min(cleanQuery.length, 80)},
        'full',
        ${h3Res10},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
        1.0,
        'dropoff_point',
        ${tripHash},
        ${completedAt}
      )
      ON CONFLICT DO NOTHING;
    `);

    logger.info('[dpmaps/ingestor] Ingested trip telemetry', {
      h3_res10: h3Res10,
      trip_hash: tripHash.slice(0, 12),
      query_len: cleanQuery.length,
    });
  } catch (err: unknown) {
    // If dpmaps table is not yet provisioned in current environment, log without failing
    logger.warn('[dpmaps/ingestor] Evidence ledger insert skipped (table may not exist)', {
      trip_hash: tripHash.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    accepted: true,
    trip_hash: tripHash,
    h3_res10: h3Res10,
    normalized_query: normalizedQuery,
  };
}
