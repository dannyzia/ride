-- T6 Phase 1 artifact — Ride RLS hardening script (IDEMPOTENT, NOT EXECUTED)
-- Generated 2026-09-25 from live DB state (125 public tables).
--
-- LIVE DB STATE AT AUDIT TIME (verified via pg_catalog, read-only):
--   rowsecurity = true on ALL 125 tables     (the security advisory's
--     "rowsecurity = false" premise is STALE — RLS is already enabled)
--   pg_policies = 0 rows                     (zero policies anywhere)
--   relforcerowsecurity = false on all 125   (FORCE not set — table owners
--     bypass RLS; supabase_admin/postgres/supabase_storage_auth etc.)
--   grants: anon + authenticated hold SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
--     REFERENCES/TRIGGER on ALL 125 tables  (full default Supabase grant set)
--   app connection role: postgres (owner → bypasses RLS regardless of FORCE)
--
-- WHAT THIS SCRIPT DOES (Phase 2, only on explicit owner GO):
--   1. Enable + FORCE RLS on every public table (idempotent no-ops where set)
--   2. Install a DEFAULT-DENY posture: no permissive policy is created, so
--      anon/authenticated lose all data-path access. Owner roles (Drizzle
--      service path) keep bypassing via FORCE-exempt ownership.
--   3. Whitelist the ONE legitimate client data path: authenticated users may
--      read their own users row (admin panel role lookups). Policy uses
--      (select auth.uid()) for initplan caching per Supabase perf guidance.
--
-- ROLLBACK (full): for every table below run
--   DROP POLICY IF EXISTS users_self_read ON public.<t>;
--   ALTER TABLE public.<t> NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.<t> DISABLE ROW LEVEL SECURITY;
-- ROLLBACK (partial, keep enablement): drop policies + NO FORCE only.

-- ── 1. Enable + FORCE RLS (idempotent) ─────────────────────────────────
-- Generated from pg_tables WHERE schemaname='public'; matches src/db/schema.ts
-- 1:1 (125 tables, delta verified none).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ── 2. DEFAULT-DENY: no policies are created for anon/authenticated ────
-- With RLS enabled+forced and zero permissive policies, anon/authenticated
-- get zero rows on every table (Postgres RLS denies by default). Deliberate.

-- ── 3. Single whitelist: self-read on users (admin panel needs it) ─────
-- Covers the 4 audited client call sites (components/admin/AdminShell.tsx:362,
-- app/admin/_layout.tsx:58, app/admin/fare-config.tsx:444 — all read
-- users.role WHERE auth_uid = own session uid).
CREATE POLICY users_self_read
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth_uid = (select auth.uid()));

-- NOTE (audit): every OTHER anon-key client data path must be verified dead
-- before Phase 2. If new client reads are added later they will silently
-- return zero rows — prefer API routes (Drizzle service path) in all cases.
