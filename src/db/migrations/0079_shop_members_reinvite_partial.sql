-- C6-3: re-invite after offboarding. shop_members rows are never hard-deleted
-- (DELETE /api/shop/[id]/members sets removed_at), but the uniqueness was a
-- FULL unique index on (shop_id, user_id) — so re-inviting a removed member
-- 23505'd into the route's 409 already_member, permanently. The invariant we
-- actually need is "one LIVE membership per (shop, user)": the index becomes
-- partial over removed_at IS NULL (same shape as packages_name_live_uq,
-- migration 0057). A double-invite of an ACTIVE member still 23505s, so the
-- route's 409 path is unchanged; a re-invite after removal mints a new row.
--
-- Matches schema.ts:
--   uniqueIndex("shop_members_unique_idx").on(shop_id, user_id)
--     .where(sql`${removed_at} IS NULL`)
-- The index NAME is kept so drizzle-kit diffs stay clean.
--
-- Hand-authored per the 0047+ precedent (drizzle-kit generate requires a TTY
-- this environment does not have).

-- ── Step 1: audit ───────────────────────────────────────────────────────────
-- Reported, not silent. Under the old FULL index two live rows for one
-- (shop_id, user_id) are impossible (the index forbade them, and removal is
-- soft) — but if this ever prints a non-zero count, step 2 refuses to guess
-- which membership history to keep and the migration fails loudly instead.
DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT count(*) INTO dup_groups FROM (
    SELECT shop_id, user_id FROM shop_members WHERE removed_at IS NULL
     GROUP BY shop_id, user_id HAVING count(*) > 1
  ) d;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION 'shop_members backfill: % live (shop_id, user_id) group(s) duplicated; resolve manually before applying the partial index',
      dup_groups;
  ELSE
    RAISE NOTICE 'shop_members backfill: no duplicate live memberships; proceeding to the partial index';
  END IF;
END $$;

--> statement-breakpoint
-- ── Step 2: replace the constraint ──────────────────────────────────────────
DROP INDEX IF EXISTS shop_members_unique_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS shop_members_unique_idx
  ON shop_members (shop_id, user_id)
  WHERE removed_at IS NULL;
