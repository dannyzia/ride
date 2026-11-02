-- Migration: 0088_ride_routes_and_telematics.sql
-- Hand-written migration. DO NOT RUN drizzle-kit generate (snapshot drift at 0043).

-- 1. Compact ride routes table (1 row per completed ride)
CREATE TABLE IF NOT EXISTS "ride_routes" (
  "ride_id" uuid PRIMARY KEY REFERENCES "rides"("id") ON DELETE CASCADE,
  "points" jsonb NOT NULL,
  "distance_meters" numeric(10, 2),
  "duration_seconds" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ride_routes_created_at_idx" 
ON "ride_routes" ("created_at");
--> statement-breakpoint

-- Standard security posture: ENABLE + FORCE RLS
ALTER TABLE "ride_routes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "ride_routes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Defensive revocation: succeeds in Supabase prod/staging AND plain CI postgres:16
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "ride_routes" FROM anon, authenticated;
  END IF;
END $$;