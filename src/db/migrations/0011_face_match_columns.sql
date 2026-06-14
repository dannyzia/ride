-- Migration: Adds face_match and brta_certificate columns that were added to
-- schema.ts during F13 (Driver Photo & Face Match) but never got a generated
-- migration. Without these columns the admin queue endpoint (and any code
-- selecting face_match_* from documents) returns 500 in production.
--
-- Safe to re-run: all statements use IF NOT EXISTS.

-- 1. Create the face_match_status enum type if it doesn't exist.
DO $$ BEGIN
  CREATE TYPE "public"."face_match_status" AS ENUM('pending', 'matched', 'low_confidence', 'failed', 'not_applicable');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. documents.face_match_score (numeric 5,2, nullable)
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "face_match_score" numeric(5, 2);

-- 3. documents.face_match_status (enum, default 'pending')
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "face_match_status" "public"."face_match_status" DEFAULT 'pending';

-- 4. drivers.brta_certificate_url (text, nullable)
ALTER TABLE "drivers"
  ADD COLUMN IF NOT EXISTS "brta_certificate_url" text;

-- 5. Indexes declared in schema.ts for the new columns.
CREATE INDEX IF NOT EXISTS "documents_face_match_idx"
  ON "documents" ("face_match_status")
  WHERE "face_match_status" IN ('pending', 'low_confidence');

CREATE INDEX IF NOT EXISTS "drivers_brta_cert_idx"
  ON "drivers" ("brta_certificate_url")
  WHERE "brta_certificate_url" IS NOT NULL;
