-- USER-FLOWS v2 (2026-10-12) F-30 + F-03 — STRUCTURED rejection.
-- A reject must carry code + failed field + example of an acceptable document,
-- plus an admin-only internal note that NEVER crosses to the applicant.
-- verification_reason stays as the one-line applicant-visible summary (R6);
-- the structured detail lives in verification_reject jsonb:
--   { code, field, example, internal_note }
-- verification_resubmit_count enforces F-03's "Fix & resubmit, max 3 then
-- admin unblock" cap. Additive; every new column nullable/defaulted so the
-- pre-existing rows keep working (old rejects carry reason text only).
-- Same three tables as 0064 (the verification-gated launch roles).
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "verification_reject" jsonb;
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "verification_resubmit_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "verification_reject" jsonb;
--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "verification_resubmit_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "verification_reject" jsonb;
--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "verification_resubmit_count" integer NOT NULL DEFAULT 0;
