-- Launch surfaces (S1) — enum VALUE additions ONLY.
-- D5 rule: ALTER TYPE ... ADD VALUE must be its own migration file; the new
-- value cannot be used in the same transaction that adds it. The tables/columns
-- that USE these values live in 0059.
-- Hand-authored (drizzle-kit generate requires TTY — see 0048 note).
-- Idempotent: IF NOT EXISTS keeps replays safe.

-- users.role: four public surfaces (mission §1/§2 + amendment). Platform
-- staff (admin/owner/ops_manager/moderator) unchanged.
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'shop_owner';
--> statement-breakpoint
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'fleet_owner';
--> statement-breakpoint
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'delivery_man';
--> statement-breakpoint

-- shop_orders: workshop service-booking states (mission B2:
-- booked -> confirmed -> in_progress -> done; same orders table, no
-- parallel booking system).
ALTER TYPE "shop_order_status" ADD VALUE IF NOT EXISTS 'booked';
--> statement-breakpoint
ALTER TYPE "shop_order_status" ADD VALUE IF NOT EXISTS 'confirmed';
--> statement-breakpoint
ALTER TYPE "shop_order_status" ADD VALUE IF NOT EXISTS 'in_progress';
--> statement-breakpoint
ALTER TYPE "shop_order_status" ADD VALUE IF NOT EXISTS 'done';
