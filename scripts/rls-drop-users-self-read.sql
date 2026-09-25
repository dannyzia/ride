-- Purpose:     Drop the users_self_read RLS policy once zero-policy conversion (ISSUE-81) is verified. NOT EXECUTED — Phase 2 of ISSUE-81, separate GO gate.
-- Owner:       Coding model (this session)
-- Status:      PENDING — execute only after ISSUE-81 code conversion is committed and the admin panel is live-verified
-- Related:
--   - scripts/rls-enable-force.sql — the script that installed this policy (header carries the full posture history)
--   - lib/adminRoleClient.ts — the verify-token helper that replaced the 3 anon-key reads
--   - tests/components/admin-no-client-table-reads.test.ts — the guard preventing regression
--
-- PRECONDITIONS (all must hold before executing):
--   1. ISSUE-81 code conversion committed and pushed (lib/adminRoleClient.ts + 3 call sites + guard test)
--   2. Admin panel live-verified: login gate + role badge + fare-config role reads all resolve
--      via /api/auth/verify-token (watch for silent NULL role in the badge)
--   3. tests/components/admin-no-client-table-reads.test.ts green at 12/12
--
-- WHY THIS IS SAFE: the app's data path is Drizzle over direct Postgres as the
-- `postgres` role (BYPASSRLS) — RLS policies are irrelevant to it. The only
-- consumers of `users_self_read` were the 3 anon-key reads this conversion removes.
-- After this drop, the posture is: RLS enabled + forced on all 125 public tables,
-- zero policies = full default-deny for anon/authenticated keypaths.
--
-- EXECUTE (transactional; the SELECT is a post-condition check):
BEGIN;
DROP POLICY IF EXISTS users_self_read ON public.users;
-- Post-condition: must return 0 rows
SELECT policyname FROM pg_policies WHERE schemaname = 'public';
COMMIT;

-- VERIFY POSTURE (read-only, after commit):
--   SELECT count(*) FROM pg_tables
--     WHERE schemaname='public' AND rowsecurity AND relforcerowsecurity;   -- expect 125
--   SELECT count(*) FROM pg_policies WHERE schemaname='public';            -- expect 0

-- ROLLBACK (restore the whitelist policy exactly as installed by rls-enable-force.sql;
-- auth_uid is varchar(128) hence the ::text cast — do not "simplify" it away):
-- BEGIN;
-- CREATE POLICY users_self_read ON public.users
--   FOR SELECT TO authenticated
--   USING (auth_uid::text = (select auth.uid())::text);
-- COMMIT;
