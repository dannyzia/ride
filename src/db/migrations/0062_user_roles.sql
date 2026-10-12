-- Plan 27 §1 + §13 STAGE 2 item F3 — user_roles (multi-role accounts).
-- OWNER-DECISION #8/#9 + identity-model ruling 2026-10-12 (BINDING):
--   users.phone = the unique LOGIN identity (what OTP authenticates).
--   users.id    = the system-assigned internal User ID — the key EVERY
--                 internal reference uses (orders, shops, fleets, deliveries,
--                 ledgers — never phone).
--   user_roles  = (user_id, role) UNIQUE — logically "phone | role", physically
--                 keyed by the internal ID, so a future phone-number change
--                 never orphans a role. users.role stays the primary/default
--                 role for the legacy requireRole checks and the default
--                 landing surface.
--
-- WRITE OWNERSHIP: membership rows are written ONLY by the auth paths
-- (app/api/register+api.ts and the add-a-role path) and by this migration's
-- seed backfill. Per-role APPROVAL state lives in each role's own table
-- (drivers.status, shops.status, fleets) — this table holds MEMBERSHIP only.
--
-- Hand-authored (see the 0048 header note). Idempotent throughout: every
-- statement is IF NOT EXISTS / ON CONFLICT DO NOTHING, so this replays clean on
-- BOTH a migration-applied history and a `drizzle-kit push`-built database.

CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" "user_role" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_user_role_uq" ON "user_roles" ("user_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_role_idx" ON "user_roles" ("role");
--> statement-breakpoint

COMMENT ON TABLE "user_roles" IS 'Multi-role account membership (Plan 27 §1, OWNER-DECISION #8/#9). Sole writers: the auth registration / add-a-role paths and this migration''s seed backfill. MEMBERSHIP only — per-role approval state lives in each role''s own table (drivers.status, shops.status, fleets).';
--> statement-breakpoint

-- Seed backfill: every existing account's primary role becomes a membership
-- row. Idempotent on replay (a push-built DB may already have been backfilled).
INSERT INTO "user_roles" ("user_id", "role")
SELECT "id", "role" FROM "users"
ON CONFLICT ("user_id", "role") DO NOTHING;
--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- SECURITY POSTURE (D1) — identical to the 0058/0059 launch tables.
-- Supabase default privileges re-grant NEW tables to anon/authenticated, so
-- enable + force + revoke ship in the same file as the DDL.
-- Post-migration probe: forced=✓, grants 0.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "user_roles" FROM anon, authenticated;
--> statement-breakpoint
