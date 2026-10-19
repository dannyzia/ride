-- F-39 customer-complaint chain (STAGE D1-FIX, owner ruling 2026-10-17):
-- a courier flags a short-paying customer against the F-38 short-pay
-- evidence (the courier_remittance_dues row carrying the short-pay note);
-- the shop escalates to the platform; an admin bans (users suspension via
-- the C2-1 gate) or dismisses. Status: open → escalated → banned|dismissed.
--
-- Numbered 0083: the stage order named 0076/0077, but both numbers were
-- already taken (0076 ×2, 0077–0082 shipped) — next free number used.
--
-- Standard posture: ENABLE + FORCE RLS + REVOKE ALL from anon/authenticated
-- (Supabase default privileges re-grant new tables to anon/authenticated).
CREATE TYPE "public"."customer_complaint_status" AS ENUM('open', 'escalated', 'banned', 'dismissed');
--> statement-breakpoint
CREATE TABLE "customer_complaints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "shop_orders"("id"),
  "leg_id" uuid REFERENCES "deliveries"("id"),
  "raised_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "shop_id" uuid NOT NULL REFERENCES "shops"("id"),
  "against_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "evidence_due_id" uuid REFERENCES "courier_remittance_dues"("id"),
  "reason" text NOT NULL,
  "courier_note" text,
  "status" "customer_complaint_status" DEFAULT 'open' NOT NULL,
  "escalated_by" uuid REFERENCES "users"("id"),
  "escalated_at" timestamptz,
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamptz,
  "decision_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "customer_complaints_shop_idx" ON "customer_complaints" ("shop_id", "status");
--> statement-breakpoint
CREATE INDEX "customer_complaints_status_idx" ON "customer_complaints" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "customer_complaints_against_idx" ON "customer_complaints" ("against_user_id");
--> statement-breakpoint
ALTER TABLE "customer_complaints" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "customer_complaints" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "customer_complaints" FROM anon, authenticated;
