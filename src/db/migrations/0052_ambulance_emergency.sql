-- 0052: Ambulance certifications + emergency requests (Phase 6, spec v2 §A.5)
-- DDL normative-by-reference: v1 spec §A.5 (kilo/plans/1788155377908-…spec.md), with
-- v2 additions: emergency_requests.expires_at NOT NULL (TTL sweep) + F41 assignee-status index.
-- NOTE: hand-authored (drizzle-kit generate requires TTY — see 0047/0051 note). Additive only.

DO $$ BEGIN
  CREATE TYPE "certification_status" AS ENUM ('unverified','pending','verified','revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "emergency_status" AS ENUM ('broadcasting','assigned','en_route_pickup','arrived','en_route_dropoff','completed','cancelled','failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ambulance_certifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id"),
  "certification_status" "certification_status" NOT NULL DEFAULT 'pending',
  "cert_number" text,
  "issuing_body" text,
  "issued_at" timestamptz,
  "expires_at" timestamptz,
  "service_level" varchar(3),
  "document_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamptz,
  "review_notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ambulance_certifications_service_level_check" CHECK ("service_level" IN ('BLS','ALS'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ambulance_certifications_user_vehicle_idx" ON "ambulance_certifications" ("user_id","vehicle_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ambulance_certifications_user_idx" ON "ambulance_certifications" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ambulance_certifications_status_idx" ON "ambulance_certifications" ("certification_status","expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "caller_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "pickup_address" text NOT NULL,
  "pickup_lat" numeric(9, 6) NOT NULL,
  "pickup_lng" numeric(9, 6) NOT NULL,
  "dropoff_address" text,
  "dropoff_lat" numeric(9, 6),
  "dropoff_lng" numeric(9, 6),
  "patient_condition" text NOT NULL,
  "requires_paramedic" boolean NOT NULL DEFAULT false,
  "service_level" varchar(3),
  "status" "emergency_status" NOT NULL DEFAULT 'broadcasting',
  "accepted_cert_id" uuid REFERENCES "ambulance_certifications"("id"),
  "accepted_at" timestamptz,
  "en_route_pickup_at" timestamptz,
  "arrived_at" timestamptz,
  "en_route_dropoff_at" timestamptz,
  "completed_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "failure_reason" text,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_requests_service_level_check" CHECK ("service_level" IN ('BLS','ALS'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emergency_requests_status_idx" ON "emergency_requests" ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emergency_requests_caller_idx" ON "emergency_requests" ("caller_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emergency_requests_assignee_status_idx" ON "emergency_requests" ("accepted_cert_id","status");
