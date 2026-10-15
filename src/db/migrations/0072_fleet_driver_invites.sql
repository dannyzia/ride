-- S5 (plan 27 §1.2 D6 audit): fleet driver invite WITH CONSENT (F-17/R9).
-- The 2026-09-09 add-flows epic (D2) deferred a token table because its Phase A
-- attached drivers directly; the S5 order requires the driver's CONSENT before
-- a cross-account attach, so a pending-invite row is now justified (no existing
-- driver-consent machinery anywhere on disk).
--
--   phone-keyed: the owner invites the phone number; the invitee ACCEPTS from
--   their own session (attach then runs the §4.3 limit checks + the single-
--   fleet rule — F-17: an existing driver in ANOTHER fleet is REJECTED, never
--   silently transferred, on the CONSENT path).
--   status: pending → accepted | declined | expired (lazy expiry via expires_at).
--   D1 posture: ENABLE + FORCE RLS + REVOKE ALL from anon/authenticated —
--   Supabase default privileges re-grant new tables to anon/authenticated.
CREATE TABLE "fleet_driver_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fleet_id" uuid NOT NULL REFERENCES "fleets"("id"),
  "phone" varchar(30) NOT NULL,
  "invited_by" uuid REFERENCES "users"("id"),
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "responded_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- One OPEN invite per phone per fleet (the barrier against duplicate rows).
CREATE UNIQUE INDEX "fdi_fleet_phone_pending_uq" ON "fleet_driver_invites" ("fleet_id", "phone") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX "fdi_phone_idx" ON "fleet_driver_invites" ("phone");
--> statement-breakpoint
CREATE INDEX "fdi_fleet_status_idx" ON "fleet_driver_invites" ("fleet_id", "status");
--> statement-breakpoint
ALTER TABLE "fleet_driver_invites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fleet_driver_invites" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "fleet_driver_invites" FROM anon, authenticated;
