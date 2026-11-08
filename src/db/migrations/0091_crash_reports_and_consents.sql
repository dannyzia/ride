-- Migration: 0091_crash_reports_and_consents.sql
-- First-party crash logger + granular consent architecture
-- (.kilo/plans/crash-logger-and-consent-architecture-plan.md Phase 1).
--
-- 1) client_crash_reports: first-party crash telemetry (Option B, zero
--    third-party SDKs). Written ONLY by POST /api/telemetry/crash.
-- 2) users.marketing_opt_in (+_at) + users.terms_version: separated
--    registration consent (mandatory terms vs optional marketing, §4/§6).
--    marketing_opt_in defaults FALSE (unchecked). Written ONLY by
--    app/api/register+api.ts.
-- 3) emergency_requests.health_consent_granted (+_at): explicit consent for
--    patient health notes (§7). Written ONLY by
--    app/api/emergency/requests+api.ts.
--
-- Standard posture: ENABLE + FORCE RLS + REVOKE ALL from anon/authenticated
-- (server-side access only, same as every other table in this project).

CREATE TABLE IF NOT EXISTS "client_crash_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "device_id" varchar(128),
  "platform" varchar(20) NOT NULL,
  "app_version" varchar(32) NOT NULL,
  "error_message" text NOT NULL,
  "stack_trace" text,
  "component_stack" text,
  "is_fatal" boolean DEFAULT false NOT NULL,
  "extra_data" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ccr_created_at_idx" ON "client_crash_reports" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccr_user_id_idx" ON "client_crash_reports" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccr_platform_idx" ON "client_crash_reports" ("platform");
--> statement-breakpoint

ALTER TABLE "client_crash_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_crash_reports" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "client_crash_reports" FROM anon, authenticated;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "marketing_opt_in" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_opt_in_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" varchar(32) DEFAULT 'v1.0';
--> statement-breakpoint

ALTER TABLE "emergency_requests" ADD COLUMN "health_consent_granted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "emergency_requests" ADD COLUMN "health_consent_at" timestamptz;
