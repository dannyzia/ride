-- M-3 defense in depth: uniqueness on packages.name among LIVE rows.
--
-- WHY: `packages.name` carried no uniqueness at all. `ensureLaunchFreePackage`
-- (lib/launchFreeSubscription.ts) closes its own check-then-insert race with a
-- transaction-scoped advisory lock + in-lock recheck, but a lock protects only
-- the writers that take it. This index makes the invariant a property of the
-- SCHEMA, so any future writer — an admin POST, a rename, a script, a second
-- service — is covered without remembering to acquire a lock.
--
-- WHY PARTIAL (`WHERE deleted_at IS NULL`) rather than a plain UNIQUE(name):
--   1. packages are SOFT-deleted — admin DELETE (app/api/admin/packages+api.ts)
--      sets deleted_at + is_active = false. A plain UNIQUE(name) would then
--      permanently reserve the name: an admin could never re-create "Pro 200"
--      after retiring it. As of this writing the live DB already holds 4 name
--      groups with a live row AND a soft-deleted row ("Free Trial", "Pro 200",
--      "Starter 50", "Unlimited"), so a plain UNIQUE would not even apply.
--   2. It matches the lookup it protects. ensureLaunchFreePackage selects
--      `name = 'Launch Free' AND deleted_at IS NULL`, and the admin list route
--      filters soft-deleted rows out. Duplicates that matter are duplicates
--      among LIVE rows; that is exactly what the index forbids.
--
-- Hand-authored per the 0047+ precedent (drizzle-kit generate requires a TTY
-- this environment does not have). Matches schema.ts:
--   uniqueIndex("packages_name_live_uq").on(name).where(sql`${deleted_at} IS NULL`)
--
-- Re-application is a no-op: the backfill finds nothing left to reconcile and
-- the index is created IF NOT EXISTS.

-- ── Step 1: audit ───────────────────────────────────────────────────────────
-- Reported, not silent. If this ever prints a non-zero count, live duplicates
-- DID exist (i.e. a pre-index writer raced) and step 2 resolves them.
DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT count(*) INTO dup_groups FROM (
    SELECT name FROM packages WHERE deleted_at IS NULL
     GROUP BY name HAVING count(*) > 1
  ) d;
  IF dup_groups > 0 THEN
    RAISE NOTICE 'packages.name backfill: % live name group(s) duplicated; extras will be soft-deleted',
      dup_groups;
  ELSE
    RAISE NOTICE 'packages.name backfill: no duplicate live names; nothing to reconcile';
  END IF;
END $$;

-- ── Step 2: backfill ────────────────────────────────────────────────────────
-- Keep the OLDEST live row per name (created_at, id as a deterministic
-- tie-break) and soft-delete the extras, matching the admin's soft-delete
-- shape exactly (deleted_at + is_active = false + updated_at).
--
-- Soft-delete rather than DELETE is deliberate and load-bearing:
-- subscriptions.package_id and payment_events.package_id both FK to packages
-- with ON DELETE NO ACTION, so a hard DELETE of a row either fails outright or
-- would orphan real subscription history. UPDATE keeps every reference intact
-- and is reversible by clearing deleted_at.
--
-- Idempotent: a second run matches no rows, because the extras are no longer
-- live and the subquery only considers live rows.
UPDATE packages p
   SET deleted_at = now(),
       is_active  = false,
       updated_at = now()
 WHERE p.deleted_at IS NULL
   AND p.id <> (
     SELECT keep.id
       FROM packages keep
      WHERE keep.deleted_at IS NULL
        AND keep.name = p.name
      ORDER BY keep.created_at, keep.id
      LIMIT 1
   );

-- ── Step 3: the constraint ──────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS packages_name_live_uq
  ON packages (name)
  WHERE deleted_at IS NULL;
