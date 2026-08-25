/**
 * Phase 4: Vehicle Models Dataset Import
 *
 * Run via: npx tsx scripts/import-vehicle-models.ts [--dry-run] [--force]
 *
 * Imports docs/FeatureList/New Feature Plan/Vehicle Categorization/
 * vehicle-models.master.json into the vehicle_models table.
 *
 * Rules:
 *   - Strips _confidence/_sources/_dispute/_notes metadata fields
 *   - Dedup via IS NOT DISTINCT FROM (nullable year cols break ON CONFLICT)
 *   - --force overwrites existing rows (data fields only, never source/created_by)
 *   - --dry-run prints plan without writing
 *   - Never deletes rows absent from JSON (08a §13.5)
 *   - Never touches rows where source='driver'
 *   - Nested savepoints: each row is wrapped in its own savepoint so a
 *     single bad row rolls back without killing the entire 950-row batch.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });
import { db } from "../src/db";
import { vehicleModels } from "../src/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

// ── Types ────────────────────────────────────────────────────────────────

interface MasterRow {
  brand: string;
  model: string;
  year_start: number | null;
  year_end: number | null;
  body_type: string;
  typical_cc_min: number | null;
  typical_cc_max: number | null;
  passenger_seats: number;
  has_ac: boolean | null;
  default_vehicle_type: string;
  _confidence?: string;
  _sources?: string[];
  _dispute?: string | null;
  _notes?: string | null;
}

type DbRow = typeof vehicleModels.$inferSelect;
type InsertRow = typeof vehicleModels.$inferInsert;

/**
 * Drizzle's `db` (PostgresJsDatabase) and `tx` (PgTransaction) share query
 * builder methods but have different class types.  The union covers both.
 */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Load master JSON ─────────────────────────────────────────────────────

function loadMasterJson(): MasterRow[] {
  const jsonPath = path.join(
    process.cwd(),
    "docs",
    "FeatureList",
    "New Feature Plan",
    "Vehicle Categorization",
    "vehicle-models.master.json",
  );
  if (!fs.existsSync(jsonPath)) {
    logger.error(`[import-vehicle-models] Master JSON not found: ${jsonPath}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as MasterRow[];
  logger.info(`[import-vehicle-models] Loaded ${raw.length} rows from master JSON`);
  return raw;
}

// ── Strip metadata fields ────────────────────────────────────────────────

function stripMetadata(row: MasterRow): Omit<MasterRow, "_confidence" | "_sources" | "_dispute" | "_notes"> {
  const { _confidence, _sources, _dispute, _notes, ...clean } = row;
  void _confidence; void _sources; void _dispute; void _notes;
  return clean;
}

// ── Build insert payload ─────────────────────────────────────────────────

function toInsertRow(row: ReturnType<typeof stripMetadata>): InsertRow {
  return {
    brand: row.brand,
    model: row.model,
    year_start: row.year_start,
    year_end: row.year_end,
    default_vehicle_type: row.default_vehicle_type as any,
    typical_cc_min: row.typical_cc_min,
    typical_cc_max: row.typical_cc_max,
    body_type: row.body_type as any,
    has_ac: row.has_ac,
    passenger_seats: row.passenger_seats,
    is_active: true,
    source: "admin",
    created_by: null,
  };
}

// ── Check for existing row via IS NOT DISTINCT FROM ───────────────────────

/**
 * Find an existing row matching (brand, model, year_start, year_end).
 * Accepts an executor so reads go through the same transaction as writes
 * inside the live loop, or through `db` in dry-run mode.
 *
 * Does NOT filter by source — the caller decides what to do with driver
 * rows vs admin rows.
 */
async function findExisting(
  brand: string,
  model: string,
  yearStart: number | null,
  yearEnd: number | null,
  executor: Executor = db,
): Promise<DbRow | null> {
  const conditions = [
    eq(vehicleModels.brand, brand),
    eq(vehicleModels.model, model),
    yearStart === null
      ? isNull(vehicleModels.year_start)
      : eq(vehicleModels.year_start, yearStart),
  ];

  if (yearEnd === null) {
    conditions.push(isNull(vehicleModels.year_end));
  } else {
    conditions.push(eq(vehicleModels.year_end, yearEnd));
  }

  const results = await executor
    .select()
    .from(vehicleModels)
    .where(and(...conditions))
    .limit(1);

  return results[0] ?? null;
}

// ── Update fields only (never source/created_by) ─────────────────────────

function buildUpdateSet(row: ReturnType<typeof stripMetadata>) {
  return {
    body_type: row.body_type as any,
    typical_cc_min: row.typical_cc_min,
    typical_cc_max: row.typical_cc_max,
    passenger_seats: row.passenger_seats,
    has_ac: row.has_ac,
    default_vehicle_type: row.default_vehicle_type as any,
    is_active: true,
    updated_at: new Date(),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────

interface ImportStats {
  inserted: number;
  skipped: number;
  updated: number;
  driverProtected: number;
  errors: string[];
}

async function runImport(): Promise<void> {
  logger.info(`\n=== Vehicle Models Import (Phase 4) ===`);
  logger.info(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (FORCE) logger.info(`Force: will overwrite existing admin rows`);

  const masterRows = loadMasterJson();
  const cleanRows = masterRows.map(stripMetadata);

  // Pre-count per type
  const expectedCounts: Record<string, number> = {};
  for (const row of cleanRows) {
    expectedCounts[row.default_vehicle_type] =
      (expectedCounts[row.default_vehicle_type] || 0) + 1;
  }

  logger.info(`\nExpected per-type counts:`);
  for (const [vt, count] of Object.entries(expectedCounts).sort()) {
    logger.info(`  ${vt}: ${count}`);
  }
  logger.info(`  TOTAL: ${cleanRows.length}`);

  if (DRY_RUN) {
    logger.info(`\n[dry-run] Would process ${cleanRows.length} rows`);
    logger.info(`\nFirst 5 rows:`);
    for (const row of cleanRows.slice(0, 5)) {
      logger.info(`  ${row.brand} ${row.model} (${row.year_start ?? "null"}-${row.year_end ?? "null"}) → ${row.default_vehicle_type}`);
    }
    // Dry-run: simulate dedup check using `db` as executor (read-only)
    let wouldInsert = 0;
    let wouldSkip = 0;
    let driverProtected = 0;
    for (const row of cleanRows) {
      const existing = await findExisting(row.brand, row.model, row.year_start, row.year_end, db);
      if (existing) {
        if (existing.source === "driver") {
          driverProtected++;
        } else {
          wouldSkip++;
        }
      } else {
        wouldInsert++;
      }
    }
    logger.info(`\n[dry-run] Plan: ${wouldInsert} inserts, ${wouldSkip} skips, ${driverProtected} driver-protected`);
    if (FORCE) logger.info(`[dry-run] Force: would update ${wouldSkip} existing admin rows instead of skipping`);
    return;
  }

  // ── LIVE mode ───────────────────────────────────────────────────────
  // Outer transaction wraps the entire batch. Each row gets a nested
  // savepoint (tx.transaction) so a single-row failure rolls back only
  // that row — the outer commit keeps the rest.
  const stats: ImportStats = {
    inserted: 0,
    skipped: 0,
    updated: 0,
    driverProtected: 0,
    errors: [],
  };

  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < cleanRows.length; i++) {
        const row = cleanRows[i];

        try {
          // Nested savepoint: isolate each row so one failure doesn't
          // abort the entire 950-row batch.
          await tx.transaction(async (innerTx) => {
            const existing = await findExisting(
              row.brand,
              row.model,
              row.year_start,
              row.year_end,
              innerTx,
            );

            if (existing) {
              if (existing.source === "driver") {
                // Driver-submitted row: never update, never insert-around.
                stats.driverProtected++;
                logger.info(
                  `[import-vehicle-models] driver-protected: ${row.brand} ${row.model} ` +
                  `(${row.year_start ?? "null"}-${row.year_end ?? "null"}) — existing driver row id=${existing.id}`,
                );
                return; // innerTx rolls back the savepoint (nothing to undo)
              }

              if (FORCE) {
                await innerTx
                  .update(vehicleModels)
                  .set(buildUpdateSet(row))
                  .where(eq(vehicleModels.id, existing.id));
                stats.updated++;
              } else {
                stats.skipped++;
              }
            } else {
              await innerTx.insert(vehicleModels).values(toInsertRow(row));
              stats.inserted++;
            }
          });
        } catch (e: any) {
          // This row failed — its savepoint was rolled back, but the
          // outer transaction is still alive.
          const msg = `Error processing row ${i + 1}/${cleanRows.length} ${row.brand} ${row.model}: ${e.message}`;
          stats.errors.push(msg);
          logger.error(`[import-vehicle-models] ${msg}`);
        }
      }
    });
  } catch (e: any) {
    // Outer transaction failed — this should not happen since inner
    // savepoints catch per-row errors. Log and exit.
    logger.error(`[import-vehicle-models] Outer transaction failed: ${e.message}`);
    process.exit(1);
  }

  // ── Post-import verification ─────────────────────────────────────────
  logger.info(`\n=== Import Summary ===`);
  logger.info(`  Inserted: ${stats.inserted}`);
  logger.info(`  Skipped:  ${stats.skipped}`);
  logger.info(`  Updated:  ${stats.updated}`);
  logger.info(`  Driver-protected (untouched): ${stats.driverProtected}`);
  if (stats.errors.length > 0) {
    logger.info(`  Errors:   ${stats.errors.length}`);
    for (const err of stats.errors) logger.error(`    ${err}`);
  }

  const [countResult] = await db
    .select({
      total: sql<number>`count(*)::int`,
    })
    .from(vehicleModels)
    .where(eq(vehicleModels.source, "admin"));

  const dbTotal = countResult?.total ?? 0;
  logger.info(`\n=== Verification ===`);
  logger.info(`  DB admin rows: ${dbTotal}`);
  logger.info(`  JSON rows:     ${cleanRows.length}`);

  if (dbTotal !== cleanRows.length) {
    logger.error(
      `[import-vehicle-models] COUNT MISMATCH: DB has ${dbTotal} admin rows, JSON has ${cleanRows.length}. ` +
      `This may indicate missing inserts or pre-existing rows. Review manually.`,
    );
  } else {
    logger.info(`  ✅ Counts match`);
  }

  const typeCounts = await db
    .select({
      vehicle_type: vehicleModels.default_vehicle_type,
      count: sql<number>`count(*)::int`,
    })
    .from(vehicleModels)
    .where(eq(vehicleModels.source, "admin"))
    .groupBy(vehicleModels.default_vehicle_type);

  logger.info(`\n  Per-type DB counts:`);
  for (const row of typeCounts.sort((a, b) => a.vehicle_type.localeCompare(b.vehicle_type))) {
    const expected = expectedCounts[row.vehicle_type] ?? 0;
    const match = row.count === expected ? "✅" : `⚠️  (expected ${expected})`;
    logger.info(`    ${row.vehicle_type}: ${row.count} ${match}`);
  }

  logger.info(`\n=== Import Complete ===`);
}

// ── Entry point (skip when imported by tests) ────────────────────────────

const isDirectRun = process.argv[1]?.includes("import-vehicle-models");
if (isDirectRun) {
  runImport().catch((e) => {
    logger.error("[import-vehicle-models] Fatal error", e);
    process.exit(1);
  });
}

// ── Exported helpers for testing ─────────────────────────────────────────
export { stripMetadata, toInsertRow, buildUpdateSet, findExisting, runImport };
export type { MasterRow, ImportStats, Executor };
