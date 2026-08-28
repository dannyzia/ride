-- RBAC: 4-role admin family (owner ruling REV-4).
-- Extends user_role enum with owner / ops_manager / moderator, and records the
-- acting admin-family role on every config_audit_log row (nullable — legacy
-- rows predate the RBAC rollout).
-- NOTE: hand-authored (drizzle-kit generate cannot run non-interactively in
-- this repo — journal entry 0045 has no meta snapshot and 0046 is
-- unregistered; verified identical failure on the pristine schema).

ALTER TYPE "user_role" ADD VALUE 'owner';
ALTER TYPE "user_role" ADD VALUE 'ops_manager';
ALTER TYPE "user_role" ADD VALUE 'moderator';
--> statement-breakpoint
ALTER TABLE "config_audit_log" ADD COLUMN "actor_role" varchar(20);
