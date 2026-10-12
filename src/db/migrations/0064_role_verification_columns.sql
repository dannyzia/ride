-- Plan 27 §7 (admin verification queues) + R6 (reject reason surfaces to the
-- applicant in-app) — S2.
--
-- The three launch-role records already carry their PENDING state:
--   shops.status = 'pending'          (0048 varchar state machine)
--   fleets.status = 'PENDING'         (fleet_status enum)
--   couriers.status = 'pending'       (0048 varchar)
-- What they do NOT carry is the admin DECISION: when/who decided, and the
-- REASON on a reject. Driver documents keep that on `documents` (the queue
-- pattern §7 names); these three tables have no document rows, so the reason
-- lands here. Additive; no backfill (no queue has run before this migration).
--
-- Idempotent: guarded for BOTH a migration-applied history and a
-- `drizzle-kit push`-built database. The REVOKE lines restate the zero-grant
-- posture defensively (default privileges fire on CREATE, not ALTER) — all
-- three tables are server-only (no client-side supabase reads).

ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "verification_status" varchar(20) NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "verification_reason" text;
--> statement-breakpoint
-- Existing live shops predate the queue: they are already verified.
UPDATE "shops" SET "verification_status" = 'approved' WHERE "status" = 'active';
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "verification_decided_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "verification_decided_by" uuid REFERENCES "users"("id");
--> statement-breakpoint
REVOKE ALL ON "shops" FROM anon, authenticated;
--> statement-breakpoint

-- Fleet business documents (§2d): `fleets` carried only the LICENSE NUMBER,
-- never the uploaded document, so a fleet queue had nothing to review.
ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "trade_license_url" text;
--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "tax_doc_url" text;
--> statement-breakpoint

ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "verification_status" varchar(20) NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "verification_reason" text;
--> statement-breakpoint
-- Existing ACTIVE fleets predate the queue: they are already verified.
UPDATE "fleets" SET "verification_status" = 'approved' WHERE "status" = 'ACTIVE';
--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "verification_decided_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "verification_decided_by" uuid REFERENCES "users"("id");
--> statement-breakpoint
REVOKE ALL ON "fleets" FROM anon, authenticated;
--> statement-breakpoint

-- Delivery-man identity documents (§2e): `couriers` had no document columns
-- (the pre-existing self-signup path is auto-active and document-free).
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "nid_url" text;
--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "license_url" text;
--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "vehicle_note" text;
--> statement-breakpoint

ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "verification_status" varchar(20) NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "verification_reason" text;
--> statement-breakpoint
-- Existing couriers predate the queue (the self-signup path is auto-active).
UPDATE "couriers" SET "verification_status" = 'approved' WHERE "status" = 'active';
--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "verification_decided_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "verification_decided_by" uuid REFERENCES "users"("id");
--> statement-breakpoint
REVOKE ALL ON "couriers" FROM anon, authenticated;
--> statement-breakpoint
