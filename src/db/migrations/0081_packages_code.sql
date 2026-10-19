-- C10-1 grant-source identity: a stable machine-readable plan `code`
-- (e.g. 'launch_free'). The display NAME is admin-editable; clients match on
-- code, never on name — so an admin rename can never break the grant badge.
--
-- Purely additive + nullable: existing/ad-hoc plans keep NULL (unconstrained).
-- The partial unique index makes "one live row per code" a schema property
-- (same defense-in-depth pattern as packages_name_live_uq, M-3).
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "code" varchar(50);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "packages_code_live_uq" ON "packages" USING btree ("code") WHERE "code" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
-- One-time adoption: stamp the seeded Launch Free plan row. Name-matched
-- ONCE, here, at migration time — runtime code matches on code only.
UPDATE "packages" SET "code" = 'launch_free' WHERE "name" = 'Launch Free' AND "code" IS NULL AND "deleted_at" IS NULL;
