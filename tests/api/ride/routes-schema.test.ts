/**
 * Plan 28 Stage 2 (ISSUE-87) — migration 0088 + Drizzle schema for
 * compact telematics storage (`ride_routes`, 1 row per completed ride).
 *
 * Guards:
 *  - `rideRoutes` is exported from `@/src/db/schema` with the exact table
 *    name, columns, types, primary key, FK cascade, and index.
 *  - the hand-written migration exists and carries the required DDL,
 *    statement breakpoints, RLS posture, and the defensive role-revocation
 *    block (Supabase prod/staging AND plain CI postgres:16).
 */
import fs from "fs";
import path from "path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { rideRoutes, rides } from "@/src/db/schema";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../src/db/migrations/0088_ride_routes_and_telematics.sql",
);
const SCHEMA_PATH = path.resolve(__dirname, "../../../src/db/schema.ts");

const migrationSql = fs.readFileSync(MIGRATION_PATH, "utf8");
const schemaSource = fs.readFileSync(SCHEMA_PATH, "utf8");

describe("rideRoutes Drizzle schema", () => {
  it("maps to the ride_routes table", () => {
    expect(getTableConfig(rideRoutes).name).toBe("ride_routes");
  });

  it("declares ride_id as the uuid primary key", () => {
    const rideId = getTableConfig(rideRoutes).columns.find((c) => c.name === "ride_id");
    expect(rideId).toBeDefined();
    expect(rideId?.columnType).toBe("PgUUID");
    expect(rideId?.primary).toBe(true);
  });

  it("declares points / distance_meters / duration_seconds / created_at with correct types", () => {
    const byName = new Map(getTableConfig(rideRoutes).columns.map((c) => [c.name, c]));

    const points = byName.get("points");
    expect(points?.columnType).toBe("PgJsonb");
    expect(points?.notNull).toBe(true);

    const distance = byName.get("distance_meters");
    expect(distance?.columnType).toBe("PgNumeric");

    const duration = byName.get("duration_seconds");
    expect(duration?.columnType).toBe("PgInteger");

    const createdAt = byName.get("created_at");
    expect(createdAt?.columnType).toBe("PgTimestamp");
    expect(createdAt?.notNull).toBe(true);
    expect(createdAt?.hasDefault).toBe(true);
  });

  it("references rides.id with ON DELETE CASCADE", () => {
    const fks = getTableConfig(rideRoutes).foreignKeys;
    expect(fks).toHaveLength(1);
    const ref = fks[0].reference();
    expect(fks[0].onDelete).toBe("cascade");
    expect(ref.foreignTable).toBe(rides);
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(["id"]);
    expect(ref.columns.map((c) => c.name)).toEqual(["ride_id"]);
  });

  it("defines the ride_routes_created_at_idx index on created_at", () => {
    const indexes = getTableConfig(rideRoutes).indexes;
    const createdIdx = indexes.find((idx) => idx.config.name === "ride_routes_created_at_idx");
    expect(createdIdx).toBeDefined();
    expect(
      createdIdx?.config.columns.map((c) => (c as { name?: string }).name),
    ).toEqual(["created_at"]);
  });

  it("is exported from schema.ts with the cascade reference and index", () => {
    expect(schemaSource).toContain("export const rideRoutes = pgTable(");
    expect(schemaSource).toContain('"ride_routes",');
    expect(schemaSource).toContain(
      ".references(() => rides.id, { onDelete: \"cascade\" })",
    );
    expect(schemaSource).toContain('index("ride_routes_created_at_idx").on(t.created_at)');
  });
});

describe("0088_ride_routes_and_telematics migration", () => {
  it("creates ride_routes with ride_id PK referencing rides(id) ON DELETE CASCADE", () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS "ride_routes"');
    expect(migrationSql).toContain(
      '"ride_id" uuid PRIMARY KEY REFERENCES "rides"("id") ON DELETE CASCADE',
    );
    expect(migrationSql).toContain('"points" jsonb NOT NULL');
    expect(migrationSql).toContain('"distance_meters" numeric(10, 2)');
    expect(migrationSql).toContain('"duration_seconds" integer');
    expect(migrationSql).toContain('"created_at" timestamptz NOT NULL DEFAULT now()');
  });

  it("creates the created_at index", () => {
    expect(migrationSql).toContain('CREATE INDEX IF NOT EXISTS "ride_routes_created_at_idx"');
  });

  it("enables and forces row-level security", () => {
    expect(migrationSql).toContain('ALTER TABLE "ride_routes" ENABLE ROW LEVEL SECURITY;');
    expect(migrationSql).toContain('ALTER TABLE "ride_routes" FORCE ROW LEVEL SECURITY;');
  });

  it("carries the defensive pg_roles revocation block", () => {
    expect(migrationSql).toContain("SELECT FROM pg_roles WHERE rolname = 'anon'");
    expect(migrationSql).toContain('REVOKE ALL ON "ride_routes" FROM anon, authenticated;');
  });

  it("separates statements with drizzle breakpoints", () => {
    const breakpoints = migrationSql.split("--> statement-breakpoint");
    // 6 statements: table, index, enable RLS, force RLS, revocation (+ trailing).
    expect(breakpoints.length).toBeGreaterThanOrEqual(5);
  });

  it("is hand-written: no drizzle-kit generate marker", () => {
    expect(migrationSql).toContain("DO NOT RUN drizzle-kit generate");
  });
});
